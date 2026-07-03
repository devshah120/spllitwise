# Splitwise Backend

Node.js + Express + MongoDB (Mongoose) REST API for a Splitwise-style expense
sharing app. Handles auth, groups, expenses with flexible splitting, settlements,
and balance calculation with debt simplification.

## Stack

- **Express** — HTTP server & routing
- **MongoDB / Mongoose** — data store
- **JWT** (`jsonwebtoken`) — stateless auth
- **bcryptjs** — password hashing
- **express-validator** — request validation

## Getting started

```bash
cd server
npm install
cp .env.example .env      # then edit values
npm run dev               # nodemon, or `npm start` for plain node
```

Requires a running MongoDB (local `mongodb://127.0.0.1:27017/splitwise` by
default, or set `MONGO_URI` to an Atlas connection string).

### Environment variables

| Var              | Description                          | Default                                |
| ---------------- | ------------------------------------ | -------------------------------------- |
| `PORT`           | Server port                          | `5000`                                 |
| `NODE_ENV`       | `development` / `production`         | `development`                          |
| `MONGO_URI`      | MongoDB connection string            | `mongodb://127.0.0.1:27017/splitwise`  |
| `JWT_SECRET`     | Secret for signing tokens            | —                                      |
| `JWT_EXPIRES_IN` | Token lifetime                       | `7d`                                   |

## Auth

All routes except `/api/health`, `/api/auth/register`, and `/api/auth/login`
require an `Authorization: Bearer <token>` header.

## API reference

### Auth
| Method | Endpoint             | Body                          | Description                  |
| ------ | -------------------- | ----------------------------- | ---------------------------- |
| POST   | `/api/auth/register` | `{ name, email, password }`   | Create account, returns JWT  |
| POST   | `/api/auth/login`    | `{ email, password }`         | Login, returns JWT           |
| GET    | `/api/auth/me`       | —                             | Current user profile         |

### Users
| Method | Endpoint                  | Description                           |
| ------ | ------------------------- | ------------------------------------- |
| GET    | `/api/users?search=term`  | Search users by name/email            |
| GET    | `/api/users/:id`          | Get a user                            |

### Groups
| Method | Endpoint                              | Body / Notes                                  |
| ------ | ------------------------------------- | --------------------------------------------- |
| GET    | `/api/groups`                         | Groups the current user belongs to            |
| POST   | `/api/groups`                         | `{ name, description?, memberIds? }`          |
| GET    | `/api/groups/:id`                     | Group detail (members only)                   |
| PATCH  | `/api/groups/:id`                     | `{ name?, description? }` (creator only)      |
| DELETE | `/api/groups/:id`                     | Delete group + its expenses (creator only)    |
| POST   | `/api/groups/:id/members`             | `{ userId }` — add member                     |
| DELETE | `/api/groups/:id/members/:userId`     | Remove member (creator only)                  |
| GET    | `/api/groups/:id/balances`            | Net balances + "who pays whom" suggestions    |

### Expenses
| Method | Endpoint                          | Body / Notes                                            |
| ------ | --------------------------------- | ------------------------------------------------------- |
| GET    | `/api/groups/:groupId/expenses`   | List group expenses                                     |
| POST   | `/api/groups/:groupId/expenses`   | Create expense (see below)                              |
| GET    | `/api/expenses/:id`               | Expense detail                                          |
| PATCH  | `/api/expenses/:id`               | Update expense (recomputes splits if amount/split changes) |
| DELETE | `/api/expenses/:id`               | Delete expense                                          |

**Create expense body:**

```jsonc
{
  "description": "Dinner",
  "amount": 90,
  "paidBy": "<userId>",           // optional, defaults to current user
  "splitType": "equal",           // "equal" | "exact" | "percentage"
  "participants": ["id1","id2"],  // optional, defaults to all group members
  "values": {                     // required for "exact"/"percentage"
    "id1": 60, "id2": 30          // exact: amounts; percentage: percents summing to 100
  },
  "date": "2026-07-03",           // optional
  "notes": "optional"
}
```

- `equal` — total split evenly; rounding drift lands on the last participant.
- `exact` — `values` are amounts that must sum to `amount`.
- `percentage` — `values` are percentages that must sum to 100.

### Settlements
| Method | Endpoint                             | Body / Notes                                   |
| ------ | ------------------------------------ | ---------------------------------------------- |
| GET    | `/api/groups/:groupId/settlements`   | List settlements                               |
| POST   | `/api/groups/:groupId/settlements`   | `{ from?, to, amount, note? }` record a payment |
| DELETE | `/api/settlements/:id`               | Delete a settlement                            |

## Balances

`GET /api/groups/:id/balances` returns:

```jsonc
{
  "balances": [
    { "user": { "id", "name", "email" }, "balance": 12.5 }  // + owed to them, - they owe
  ],
  "suggestions": [
    { "from": { "id", "name" }, "to": { "id", "name" }, "amount": 12.5 }
  ]
}
```

`suggestions` uses greedy debt simplification to minimise the number of
payments needed to settle the group.

## Project structure

```
server/
├── src/
│   ├── config/db.js          # Mongo connection
│   ├── models/               # User, Group, Expense, Settlement
│   ├── controllers/          # Route handlers
│   ├── routes/               # Express routers
│   ├── middleware/           # auth, validation, error handling
│   ├── utils/                # token, asyncHandler, splitCalculator
│   ├── app.js                # Express app wiring
│   └── server.js             # Entry point
├── .env.example
└── package.json
```
