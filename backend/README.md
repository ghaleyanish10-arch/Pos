# Mesa OS - Go Backend

REST API backend for the Mesa OS restaurant management platform.

## Tech Stack

- **Language:** Go 1.22+
- **Framework:** Gin
- **Database:** PostgreSQL (via pgx/v5)
- **Auth:** JWT (access + refresh tokens)
- **RBAC:** 4 roles with hierarchical permissions

## Quick Start

### Prerequisites

- Go 1.22+
- PostgreSQL 14+

### Setup

```bash
# 1. Copy and configure environment
cp .env.example .env

# 2. Create the database
createdb mesa_os

# 3. Download dependencies
make deps

# 4. Run the server (auto-migrates on start)
make run
```

The server starts on `http://localhost:8080`. Migrations run automatically on startup.

### First User

```bash
# Register a Corporate Admin
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@mesa.os","password":"admin123","role":"Corporate Admin"}'

# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mesa.os","password":"admin123"}'
```

## API Overview

All routes are prefixed with `/api/v1`. Protected routes require `Authorization: Bearer <token>`.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login and get tokens |
| POST | `/auth/register` | Register new user (Corporate Admin) |
| POST | `/auth/refresh` | Refresh access token |
| GET | `/health` | Health check |

### Orders
| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders` | List orders |
| POST | `/orders` | Create order |
| GET | `/orders/:id` | Get order |
| PUT | `/orders/:id` | Update order status |
| DELETE | `/orders/:id` | Soft delete order |

### KDS
| Method | Path | Description |
|--------|------|-------------|
| GET | `/kds/tickets` | List tickets (filter by `?station=&status=`) |
| PUT | `/kds/tickets/:id/fire` | Fire ticket |
| PUT | `/kds/tickets/:id/bump` | Bump ticket to next stage |

### Transactions & Payments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/transactions` | List transactions |
| POST | `/transactions` | Create transaction |
| POST | `/transactions/manual` | Manual payment |

### Refunds
| Method | Path | Description |
|--------|------|-------------|
| GET | `/refunds` | List refunds (filter by `?status=`) |
| POST | `/refunds` | Request refund |
| PUT | `/refunds/:id/approve` | Approve refund (lock + approve) |
| PUT | `/refunds/:id/resolve` | Resolve refund |

### Menu
| Method | Path | Description |
|--------|------|-------------|
| GET | `/menu` | List menu items |
| GET | `/menu/categories` | List categories |
| POST | `/menu` | Create menu item |
| PUT | `/menu/:id` | Update menu item |
| DELETE | `/menu/:id` | Soft delete menu item |

### Inventory
| Method | Path | Description |
|--------|------|-------------|
| GET | `/inventory` | List inventory |
| POST | `/inventory` | Create inventory item |
| PUT | `/inventory/:id` | Update inventory item |
| PUT | `/inventory/:id/adjust` | Adjust stock (+/- delta) |
| GET | `/inventory/reorder-suggestions` | Get low-stock suggestions |

### Guests
| Method | Path | Description |
|--------|------|-------------|
| GET | `/guests` | List guests |
| POST | `/guests` | Create guest |
| PUT | `/guests/:id` | Update guest |
| GET | `/guests/:id/timeline` | Guest visit history |

### Staff & Shifts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/staff` | List staff |
| POST | `/staff` | Create staff member |
| PUT | `/staff/:id` | Update staff member |
| GET | `/shifts` | List shifts |
| POST | `/shifts` | Create shift |
| PUT | `/shifts/:id` | Update shift |
| DELETE | `/shifts/:id` | Delete shift |

### Bookings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/tables` | List floor tables |
| GET | `/reservations` | List reservations |
| POST | `/reservations` | Create reservation |
| PUT | `/reservations/:id` | Update reservation |
| PUT | `/reservations/:id/seat` | Seat guest |
| GET | `/waitlist` | List waitlist |
| POST | `/waitlist` | Add to waitlist |
| PUT | `/waitlist/:id/notify` | Notify & remove from waitlist |

### Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/revenue` | Revenue by day |
| GET | `/reports/top-sellers` | Top selling items |
| GET | `/reports/slow-movers` | Slow moving items |
| GET | `/reports/summary` | Revenue/orders/AOV summary |
| GET | `/health/branches` | Branch health status |

### Invoices
| Method | Path | Description |
|--------|------|-------------|
| GET | `/invoices` | List invoices |
| POST | `/invoices` | Create invoice |
| PUT | `/invoices/:id` | Update invoice status |

### Loyalty
| Method | Path | Description |
|--------|------|-------------|
| GET | `/loyalty/tiers` | List loyalty tiers |
| GET | `/loyalty/ledger` | Points ledger |
| POST | `/loyalty/earn` | Earn points |
| POST | `/loyalty/redeem` | Redeem points |

### Marketing
| Method | Path | Description |
|--------|------|-------------|
| GET | `/campaigns` | List campaigns |
| POST | `/campaigns` | Create campaign |
| PUT | `/campaigns/:id` | Update campaign |

### Online Store
| Method | Path | Description |
|--------|------|-------------|
| GET | `/store/settings` | Get store settings |
| PUT | `/store/settings` | Update store settings |

### POS
| Method | Path | Description |
|--------|------|-------------|
| PUT | `/pos/tables/:id` | Update table state |
| GET | `/pos/tables/:id/bill` | Get table bill |

### Fiscal
| Method | Path | Description |
|--------|------|-------------|
| GET | `/fiscal` | List fiscal entries |
| GET | `/fiscal/:transaction_id` | Get fiscal entry |
| POST | `/fiscal` | Create fiscal entry |

### Recipes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/recipes` | List recipes |
| POST | `/recipes` | Create recipe |
| PUT | `/recipes/:id` | Update recipe |

### Purchase Orders
| Method | Path | Description |
|--------|------|-------------|
| GET | `/purchase-orders` | List POs |
| POST | `/purchase-orders` | Create PO |
| PUT | `/purchase-orders/:id` | Update PO status |
| PUT | `/purchase-orders/:id/receive` | Mark PO received |

### Transfers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/transfers` | List transfers |
| POST | `/transfers` | Create transfer |
| PUT | `/transfers/:id/receive` | Mark transfer received |

### Reviews
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reviews` | List reviews |
| PUT | `/reviews/:id/reply` | Reply to review |

### Delivery
| Method | Path | Description |
|--------|------|-------------|
| GET | `/delivery` | List delivery orders |
| PUT | `/delivery/:id/status` | Update delivery status |

### Feedback
| Method | Path | Description |
|--------|------|-------------|
| GET | `/feedback` | List survey responses |
| PUT | `/feedback/:id/resolve` | Resolve feedback |
| PUT | `/feedback/:id/escalate` | Escalate feedback |

### Permissions
| Method | Path | Description |
|--------|------|-------------|
| GET | `/permissions` | List all permissions matrix |
| GET | `/permissions/:role` | Get role permissions |
| PUT | `/permissions/:role` | Update role permissions |

### Audit
| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit` | List audit events |

## Roles & Hierarchy

| Level | Role | Description |
|-------|------|-------------|
| 1 | Cashier | Basic POS operations |
| 2 | Store Manager | Menu, inventory, staff, reports |
| 3 | Inventory Auditor | Stock adjustments, reorder |
| 4 | Corporate Admin | Everything: permissions, fiscal, audit |

## Project Structure

```
backend/
├── cmd/server/main.go          # Entry point
├── internal/
│   ├── config/                 # Environment-based configuration
│   ├── db/                     # PostgreSQL connection & migrations
│   ├── middleware/              # Auth (JWT), CORS, RBAC
│   ├── auth/                   # Login, register, token generation
│   ├── model/                  # Data structs & request/response DTOs
│   ├── repo/                   # SQL queries (one file per domain)
│   ├── handler/                # HTTP handlers (one file per module)
│   └── router/                 # Route registration
├── migrations/                 # SQL migration files
├── go.mod
├── Makefile
└── .env.example
```
