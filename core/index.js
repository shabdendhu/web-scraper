const express = require("express");
const { Kafka } = require("kafkajs");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();
const app = express();

const kafka = new Kafka({
  clientId: "core-service",
  brokers: ["localhost:9092"],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "core-results-group" });

app.use(express.json());

// Connect Kafka producer and consumer on startup
async function connectKafka() {
  try {
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({
      topic: "scraping-results",
      fromBeginning: true,
    });

    // Handle incoming scraping results
    await consumer.run({
      eachMessage: async ({ message }) => {
        const result = JSON.parse(message.value.toString());
        console.log("Received scraping result:", result);

        try {
          if (result.status === "failed") {
            await handleFailedTask(result);
          } else {
            await handleSuccessfulTask(result);
          }
        } catch (error) {
          console.error("Error processing scraping result:", error);
        }
      },
    });
  } catch (error) {
    console.error("Error connecting to Kafka:", error);
    process.exit(1);
  }
}

async function handleFailedTask(result) {
  await prisma.scrapingTask.update({
    where: { id: result.taskId },
    data: {
      status: "failed",
      error: result.error,
      updatedAt: new Date(),
    },
  });
}

async function handleSuccessfulTask(result) {
  const { taskId, page, data, status, sourceUrl } = result;

  // Store items using transaction
  await prisma.$transaction(async (tx) => {
    // Update task status
    await tx.scrapingTask.update({
      where: { id: taskId },
      data: {
        status,
        currentPage: page,
        updatedAt: new Date(),
      },
    });

    // Store scraped items
    if (Array.isArray(data) && data.length > 0) {
      await tx.scrapedItem.createMany({
        data: data.map((item) => ({
          taskId,
          sourceUrl,
          data: item, // Store the entire item as JSON
        })),
      });
    }
  });
}

// API endpoint to create scraping task
app.post("/scrape", async (req, res) => {
  const { url, pages = 1, dataType, config } = req.body;

  if (!url || !dataType) {
    return res.status(400).json({ error: "URL and dataType are required" });
  }

  try {
    // Create task in database
    const task = await prisma.scrapingTask.create({
      data: {
        url,
        pages,
        dataType,
        config,
        status: "pending",
      },
    });

    // Send task to Kafka
    await producer.send({
      topic: "scraping-tasks",
      messages: [
        {
          value: JSON.stringify({
            taskId: task.id,
            url: task.url,
            pages: task.pages,
            dataType: task.dataType,
            config: task.config,
          }),
        },
      ],
    });

    res.json({
      success: true,
      message: "Scraping task created",
      taskId: task.id,
    });
  } catch (error) {
    console.error("Error creating scraping task:", error);
    res.status(500).json({ error: "Failed to create scraping task" });
  }
});

// API endpoint to get task status and data with pagination
app.get("/task/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const task = await prisma.scrapingTask.findUnique({
      where: { id: taskId },
      include: {
        items: {
          take: parseInt(limit),
          skip: (parseInt(page) - 1) * parseInt(limit),
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

// API endpoint for flexible search across any data type
app.post("/search", async (req, res) => {
  const {
    dataType,
    filters = {},
    page = 1,
    limit = 10,
    sortField,
    sortOrder = "desc",
  } = req.body;

  try {
    const where = {};

    // Add dataType filter if provided
    if (dataType) {
      where.task = { dataType };
    }

    // Add custom filters based on data JSON field
    Object.entries(filters).forEach(([key, value]) => {
      where.data = {
        path: ["$." + key],
        equals: value,
      };
    });

    const items = await prisma.scrapedItem.findMany({
      where,
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
      orderBy: sortField
        ? {
            data: {
              path: ["$." + sortField],
              order: sortOrder,
            },
          }
        : { createdAt: sortOrder },
      include: {
        task: {
          select: {
            url: true,
            dataType: true,
          },
        },
      },
    });

    const total = await prisma.scrapedItem.count({ where });

    res.json({
      items,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error searching items:", error);
    res.status(500).json({ error: "Failed to search items" });
  }
});

connectKafka();

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Core API server running on port ${PORT}`);
});
