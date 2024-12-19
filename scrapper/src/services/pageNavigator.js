// scrapper/src/services/pageNavigator.js
const logger = require("../utils/logger");

class PageNavigator {
  constructor(page, config) {
    this.page = page;
    this.config = config;
  }

  async navigateToPage(baseUrl, pageNumber) {
    const url = this.buildPageUrl(baseUrl, pageNumber);
    try {
      await this.page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 60000, // Increased timeout to 60 seconds
      });
      await this.handleDynamicContent();
    } catch (error) {
      logger.error(`Navigation error for URL ${url}:`, error);
      throw error;
    }
  }

  buildPageUrl(baseUrl, pageNumber) {
    const { paginationType, pageParam = "page" } = this.config;

    switch (paginationType) {
      case "queryParam":
        const url = new URL(baseUrl);
        url.searchParams.set(pageParam, pageNumber);
        return url.toString();

      case "path":
        return `${baseUrl}/${pageNumber}`;

      case "offset":
        const url2 = new URL(baseUrl);
        const offset = (pageNumber - 1) * (this.config.itemsPerPage || 10);
        url2.searchParams.set("offset", offset);
        return url2.toString();

      default:
        return baseUrl;
    }
  }

  async handleDynamicContent() {
    const { waitForSelector, scrollToBottom } = this.config;

    if (waitForSelector) {
      await this.page.waitForSelector(waitForSelector, {
        timeout: 60000, // Increased timeout here as well
      });
    }

    if (scrollToBottom) {
      await this.autoScroll();
    }
  }

  async autoScroll() {
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  async hasNextPage() {
    const { nextPageSelector } = this.config;
    if (!nextPageSelector) return false;

    return await this.page.evaluate((selector) => {
      const element = document.querySelector(selector);
      return (
        !!element &&
        !element.disabled &&
        !element.classList.contains("disabled")
      );
    }, nextPageSelector);
  }
}

module.exports = PageNavigator;
