// scraper/src/config/kafka.js
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "scraper-service",
  brokers: ["localhost:9092"],
});

const consumer = kafka.consumer({ groupId: "scraper-group" });
const producer = kafka.producer();

module.exports = { kafka, consumer, producer };
