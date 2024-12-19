// scrapper/src/services/browser.js
const puppeteer = require("puppeteer");
const logger = require("../utils/logger");

class BrowserService {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ],
      });
      logger.info("Browser initialized");
    } catch (error) {
      logger.error("Failed to initialize browser:", error);
      throw error;
    }
  }

  async newPage() {
    if (!this.browser) {
      await this.initialize();
    }
    const page = await this.browser.newPage();

    // Set a recent user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Increase timeout
    await page.setDefaultNavigationTimeout(60000);

    return page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new BrowserService();
