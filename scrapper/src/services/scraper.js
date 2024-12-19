// scrapper/src/services/scraper.js
const browserService = require("./browser");
const logger = require("../utils/logger");

class Scraper {
  constructor(taskId, url, config) {
    this.taskId = taskId;
    this.url = url;
    this.config = config;
    logger.info("Initializing scraper with config:", { config });
  }

  buildUrl(baseUrl, pageNumber) {
    try {
      const {
        paginationType = "queryParam",
        pageParam = "page",
        labelParam = "label",
        currentLabel,
      } = this.config;

      logger.info(
        `Building URL for page ${pageNumber}, label: ${currentLabel || "none"}`
      );

      let url;
      switch (paginationType) {
        case "queryParam":
          url = new URL(baseUrl);
          url.searchParams.set(pageParam, pageNumber);
          if (currentLabel) {
            url.searchParams.set(labelParam, currentLabel);
          }
          return url.toString();

        case "path":
          let pathUrl = `${baseUrl}/${pageNumber}`;
          if (currentLabel) {
            pathUrl += `/${currentLabel}`;
          }
          return pathUrl;

        case "replace":
          let replacedUrl = baseUrl.replace("{page}", pageNumber);
          if (currentLabel) {
            replacedUrl = replacedUrl.replace("{label}", currentLabel);
          }
          return replacedUrl;

        case "offset":
          url = new URL(baseUrl);
          const offset = (pageNumber - 1) * (this.config.itemsPerPage || 10);
          url.searchParams.set("offset", offset);
          if (currentLabel) {
            url.searchParams.set(labelParam, currentLabel);
          }
          return url.toString();

        default:
          return baseUrl;
      }
    } catch (error) {
      logger.error("Error building URL:", error);
      return baseUrl;
    }
  }

  async scrape(producer) {
    logger.info("Starting scrape with labels");
    const labels = this.config.labels || [null];

    for (const label of labels) {
      logger.info(`Processing label: ${label || "none"}`);
      this.config.currentLabel = label;

      const page = await browserService.newPage();
      let currentPage = 1;
      let hasMore = true;
      try {
        // Setup request interception if specified
        if (this.config.blockResources) {
          await page.setRequestInterception(true);
          page.on("request", (request) => {
            const resourceType = request.resourceType();
            if (this.config.blockResources.includes(resourceType)) {
              logger.debug(`Blocking resource: ${resourceType}`);
              request.abort();
            } else {
              request.continue();
            }
          });
        }

        while (
          hasMore &&
          currentPage <= Math.min(10, this.config.maxPages || 1)
        ) {
          const pageUrl = this.buildUrl(this.url, currentPage);
          logger.info(`Starting to scrape page ${currentPage}`, {
            url: pageUrl,
          });

          try {
            await page.goto(pageUrl, {
              waitUntil: this.config.waitUntil || "networkidle0",
              timeout: this.config.timeout || 90000,
            });

            logger.info("Page loaded, waiting for content");

            // Wait for content container
            if (this.config.waitForSelector) {
              await page.waitForSelector(this.config.waitForSelector, {
                timeout: this.config.selectorTimeout || 50000,
              });
            }

            // Handle dynamic loading
            if (this.config.scrollToBottom) {
              await this.autoScroll(page);
            }

            logger.info("Content loaded, starting extraction");

            // Extract items using provided selectors
            const items = await page.evaluate((config) => {
              const safeGetAttribute = (element, fieldConfig) => {
                try {
                  // Handle string-only selector config
                  if (typeof fieldConfig === "string") {
                    return (
                      element.querySelector(fieldConfig)?.textContent?.trim() ||
                      null
                    );
                  }

                  const {
                    selector,
                    attribute = "text",
                    transform,
                  } = fieldConfig;
                  const targetElement =
                    selector === "."
                      ? element
                      : element.querySelector(selector);

                  if (!targetElement) return null;

                  let value;
                  if (attribute === "text") {
                    value = targetElement.textContent.trim();
                  } else if (attribute === "html") {
                    value = targetElement.innerHTML.trim();
                  } else {
                    value = targetElement.getAttribute(attribute);
                  }

                  // Apply transforms if specified
                  if (transform) {
                    switch (transform) {
                      case "number":
                        return parseFloat(value.replace(/[^0-9.-]+/g, ""));
                      case "boolean":
                        return Boolean(value);
                      case "lowercase":
                        return value.toLowerCase();
                      case "uppercase":
                        return value.toUpperCase();
                      default:
                        return value;
                    }
                  }

                  return value;
                } catch (error) {
                  console.error("Error extracting field:", error);
                  return null;
                }
              };

              const containerSelector = config.selectors.itemContainer;
              const items = document.querySelectorAll(containerSelector);
              console.log(`Found ${items.length} items on page`);

              return Array.from(items).map((item) => {
                const data = {};
                for (const [field, fieldConfig] of Object.entries(
                  config.selectors.fields
                )) {
                  data[field] = safeGetAttribute(item, fieldConfig);
                }
                return data;
              });
            }, this.config);

            logger.info(
              `Extracted ${items.length} items from page ${currentPage}`
            );

            // Filter out invalid items
            const validItems = items.filter((item) => {
              if (this.config.requireFields) {
                return this.config.requireFields.every((field) => item[field]);
              }
              return Object.values(item).some((value) => value !== null);
            });

            logger.info(`Found ${validItems.length} valid items`);

            if (validItems.length > 0) {
              logger.info("Sending data to Kafka");
              await producer.send({
                topic: "scraping-results",
                messages: [
                  {
                    value: JSON.stringify({
                      taskId: this.taskId,
                      sourceUrl: pageUrl,
                      page: currentPage,
                      status: "processing",
                      data: validItems,
                    }),
                  },
                ],
              });

              // Check for next page using provided selector
              if (this.config.hasNextPage) {
                const hasNextPage = await page.evaluate((selector) => {
                  const nextButton = document.querySelector(selector);
                  return nextButton && !nextButton.disabled;
                }, this.config.hasNextPage);

                hasMore = hasNextPage;
                logger.info(`Next page available: ${hasMore}`);
              }

              if (hasMore) {
                currentPage++;
                if (this.config.pageDelay) {
                  logger.info(
                    `Waiting ${this.config.pageDelay}ms before next page`
                  );
                  await new Promise((resolve) =>
                    setTimeout(resolve, this.config.pageDelay)
                  );
                }
              }
            } else {
              logger.info("No valid items found, stopping pagination");
              hasMore = false;
            }
          } catch (error) {
            logger.error(`Error scraping page ${currentPage}:`, error);
            throw error;
          }
        }

        logger.info("Scraping completed successfully");
        await producer.send({
          topic: "scraping-results",
          messages: [
            {
              value: JSON.stringify({
                taskId: this.taskId,
                sourceUrl: this.url,
                status: "completed",
                totalPages: currentPage - 1,
              }),
            },
          ],
        });
      } catch (error) {
        logger.error(`Scraping failed:`, error);
        await producer.send({
          topic: "scraping-results",
          messages: [
            {
              value: JSON.stringify({
                taskId: this.taskId,
                sourceUrl: this.url,
                status: "failed",
                error: error.message,
              }),
            },
          ],
        });
      } finally {
        logger.info("Closing browser page");
        await page.close();
      }
    }
  }

  async autoScroll(page) {
    logger.info("Starting auto-scroll");
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve(true);
          }
        }, 100);
      });
    });
    logger.info("Auto-scroll completed");
  }
}

module.exports = Scraper;
