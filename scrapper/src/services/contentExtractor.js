// scraper/src/services/contentExtractor.js
const logger = require("../utils/logger");

class ContentExtractor {
  constructor(page, config) {
    this.page = page;
    this.config = config;
  }

  async extractItems() {
    const { selectors } = this.config;

    try {
      return await this.page.evaluate((selectors) => {
        const items = document.querySelectorAll(selectors.itemContainer);
        return Array.from(items).map((item) => {
          const extractedData = {};
          console.log("==================iitems==================");
          console.log(items);
          console.log("===================items=================");
          // Extract data using configured selectors
          Object.entries(selectors.fields).forEach(([field, selector]) => {
            if (typeof selector === "string") {
              // Simple selector
              const element = item.querySelector(selector);
              extractedData[field] = element
                ? element.textContent.trim()
                : null;
            } else if (typeof selector === "object") {
              // Complex selector with attributes or multiple elements
              const element = item.querySelector(selector.selector);
              if (selector.attribute) {
                extractedData[field] = element
                  ? element.getAttribute(selector.attribute)
                  : null;
              } else if (selector.multiple) {
                const elements = item.querySelectorAll(selector.selector);
                extractedData[field] = Array.from(elements).map((el) =>
                  el.textContent.trim()
                );
              }
            }
          });

          return extractedData;
        });
      }, selectors);
    } catch (error) {
      logger.error("Error extracting content:", error);
      throw error;
    }
  }
}

module.exports = ContentExtractor;
