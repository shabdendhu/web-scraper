// scraper/src/index.js
const { consumer, producer } = require("./config/kafka");
const Scraper = require("./services/scraper");
const browserService = require("./services/browser");
const logger = require("./utils/logger");

async function start() {
  try {
    await browserService.initialize();
    await consumer.connect();
    await producer.connect();

    await consumer.subscribe({ topic: "scraping-tasks", fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ message }) => {
        const task = JSON.parse(message.value.toString());
        logger.info("Received task:", task);

        const scraper = new Scraper(task.taskId, task.url, task.config);
        await scraper.scrape(producer);
      },
    });

    logger.info("Scraper service started successfully");
  } catch (error) {
    logger.error("Error starting scraper service:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  try {
    await consumer.disconnect();
    await producer.disconnect();
    await browserService.close();
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
});

start();
