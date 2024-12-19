# Web Scraping System with Kafka

A distributed web scraping system using Kafka for message queuing, PostgreSQL for data storage, and Puppeteer for web scraping.

## Features

- Distributed scraping using Kafka
- Configurable scraping rules
- Label-based pagination support
- Resource optimization
- Automatic data validation
- Progress tracking
- Error handling
- Detailed logging

## Setup

### Prerequisites

- Docker and Docker Compose
- Node.js and Yarn
- PostgreSQL
- Kafka

### Installation

1. Start the infrastructure:
```bash
docker-compose up -d
```

2. Install dependencies for both services:
```bash
cd core && yarn install
cd ../scrapper && yarn install
```

3. Initialize the database:
```bash
cd core && npx prisma db push
```

4. Start the services:
```bash
# Terminal 1 - Core Service
cd core && yarn dev

# Terminal 2 - Scraper Service
cd scrapper && yarn dev
```

## API Usage

### Create Scraping Task

#### Endpoint: `POST http://localhost:3000/scrape`

Example for TrueMeds medicine list:

```json
{
  "url": "https://www.truemeds.in/all-medicine-list",
  "dataType": "medicines",
  "maxPages": 10,
  "config": {
    "waitForSelector": ".houWZm",
    "paginationType": "queryParam",
    "pageParam": "page",
    "labelParam": "label",
    "waitUntil": "domcontentloaded",
    "labels": [
      "0", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l",
      "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
    ],
    "pageDelay": 2000,
    "blockResources": ["image", "font"],
    "selectors": {
      "itemContainer": "a.hJbQvz",
      "fields": {
        "title": {
          "selector": ".",
          "attribute": "title"
        },
        "url": {
          "selector": ".",
          "attribute": "href"
        }
      }
    },
    "hasNextPage": ".nextCta",
    "requireFields": ["title", "url"]
  }
}
```

Using curl:
```bash
curl -X POST http://localhost:3000/scrape \
-H "Content-Type: application/json" \
-d '<paste-config-here>'
```

### Configuration Details

| Field | Description | Example |
|-------|-------------|---------|
| url | Base URL to scrape | `"https://example.com"` |
| dataType | Type identifier for the data | `"medicines"` |
| maxPages | Maximum pages to scrape per label | `10` |
| waitForSelector | Element to wait for before scraping | `".product-list"` |
| paginationType | Type of pagination | `"queryParam"` |
| pageParam | URL parameter for page number | `"page"` |
| labelParam | URL parameter for label | `"label"` |
| waitUntil | Page load event to wait for | `"domcontentloaded"` |
| pageDelay | Delay between pages (ms) | `2000` |
| blockResources | Resources to block for optimization | `["image", "font"]` |
| selectors | CSS selectors for data extraction | See below |
| hasNextPage | Selector for next page button | `".nextCta"` |
| requireFields | Required fields for validation | `["title", "url"]` |

### Selectors Configuration

```json
{
  "itemContainer": "CSS selector for each item",
  "fields": {
    "fieldName": {
      "selector": "CSS selector or .",
      "attribute": "title/href/text/html"
    }
  }
}
```

### Check Task Status

#### Endpoint: `GET http://localhost:3000/task/{taskId}`

```bash
curl http://localhost:3000/task/[taskId]
```

### Search Scraped Data

#### Endpoint: `POST http://localhost:3000/search`

```bash
curl -X POST http://localhost:3000/search \
-H "Content-Type: application/json" \
-d '{
  "dataType": "medicines",
  "filters": {
    "title": "Paracetamol"
  },
  "page": 1,
  "limit": 10
}'
```

## Advanced Usage

### Pagination Types

The system supports multiple pagination patterns:

```javascript
// Query Parameter: example.com?page=1
paginationType: "queryParam"

// Path Based: example.com/page/1
paginationType: "path"

// Offset Based: example.com?offset=20
paginationType: "offset"

// Pattern Replace: example.com/page-{page}
paginationType: "replace"
```

### Data Transformations

Available field transformations:
- `number`: Convert to number
- `boolean`: Convert to boolean
- `lowercase`: Convert to lowercase
- `uppercase`: Convert to uppercase

### Resource Optimization

Configurable resource blocking:
```javascript
"blockResources": [
  "image",    // Block images
  "stylesheet", // Block CSS
  "font",     // Block fonts
  "media"     // Block media
]
```

## Error Handling

The system provides detailed error logging and handles:
- Network timeouts
- Missing selectors
- Invalid data
- Pagination errors

## Project Structure

```
web-scraper/
├── core/                # Core API service
│   ├── src/
│   ├── prisma/
│   └── package.json
├── scrapper/           # Scraping service
│   ├── src/
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT