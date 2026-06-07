# Chatly: Production-Ready MERN Real-Time Chat Application

Chatly is a high-performance, real-time messaging application designed with Clean Architecture, SOLID principles, and a feature-based modular folder structure. The app provides end-to-end encrypted messaging, role-based group chat, offline/online status tracking, and scalable WebSockets utilizing a Redis adapter.

---

## Workspace Structure

The repository is organized into a frontend and a backend workspace to facilitate independent deployment and scaling.

```
root/
├── frontend/             # React + Vite + TS client
├── backend/              # Node + Express + TS API server
├── docs/                 # Architectural specifications and API documentation
└── README.md             # Project documentation and developer guides
```

---

## Backend Architecture Explained (`backend/src/`)

The backend follows the **Repository-Service-Controller** architectural pattern to decouple the HTTP transport layer, core business domain logic, and data layer.

```
backend/src/
├── config/              # Centralized environment configuration (database, redis, cors, security, JWT)
├── database/            # Database initialization and raw schema definitions (Mongoose)
├── middleware/          # Express middlewares (Authentication, logging, validators, global error handler)
├── interfaces/          # Shared global interfaces and typings used across components
├── types/               # custom TypeScript namespaces and declarations
├── services/            # Global, independent business services (e.g. EncryptionService, EmailService)
├── repositories/        # Abstract data access layers to isolate MongoDB-specific mongoose commands
├── validators/          # Generic Zod schemas for input validation
├── utils/               # Pure utility functions and system logging setups (Winston logger)
├── events/              # Event emitters for decoupled internal pub/sub logic
├── jobs/                # Background schedules and task workers
├── logs/                # Local log store directory (ignored by Git)
├── server.ts            # Entry point of the Express API and Socket.IO servers
└── modules/             # Feature-based business domains
    ├── auth/            # Auth controllers, routes, validation schemas
    ├── chat/            # Chat & group message logic
    ├── user/            # User profiles & connection states
    └── socket/          # Socket.IO connection handling & events
```

### Why these folders exist:
* **`config/`**: Decouples application logic from configurations. Handles reading process.env and mapping to strongly typed configuration objects.
* **`modules/`**: Follows a **Feature-Based Folder Structure**. Instead of putting all controllers in one folder and routes in another, all files belonging to a specific domain (like authentication) live together. This improves code discovery and maintainability.
* **`middleware/`**: Contains cross-cutting concerns that process HTTP requests before they reach controllers (e.g., authentication filters, CORS, rate limits, schema validations).
* **`database/`**: Configures mongoose and handles database connection state lifecycle.
* **`services/` & `repositories/`**: Decouples core logic from persistence. Repositories communicate with database; Services handle business rules (e.g. hashing passwords, making calculations).
* **`server.ts`**: Entry point that coordinates database, redis, Socket.IO, and Express app boots.

---

## Frontend Architecture Explained (`frontend/src/`)

The client side is built as a single-page application using React, Vite, and TypeScript, structured by features.

```
frontend/src/
├── app/                 # Context providers, theme setups, QueryClient, global router configs
├── assets/              # Static files (SVGs, logos, custom font definitions)
├── components/          # Reusable shared UI layout components
│   ├── ui/              # Atom level design components (Shadcn UI, e.g. Button, Dialog, Input)
│   ├── common/          # Reusable composite components (Form fields, loading states, error displays)
│   └── layouts/         # Layout wraps (Dashboard viewports, App layout, Auth layouts)
├── features/            # Feature-centric modules (auth, chat, users, settings)
│   └── [feature]/       # Components, hooks, types, api-calls specific to a given domain feature
├── hooks/               # Application-wide reusable React hooks (e.g. useDebounce, useMediaQuery)
├── services/            # Clients for external communication (Axios instance, WebSocket client)
├── store/               # Zustand global state stores (separated by concern: authStore, socketStore, etc.)
├── routes/              # Client-side router configs (Public, Private, Guest layout routers)
├── types/               # Domain-agnostic global interface specifications
├── lib/                 # Third-party configurations and wrappers (e.g. styling merge tool `cn`)
├── constants/           # Read-only variables, client UI labels, endpoint strings
├── utils/               # Helper routines (date formatters, token extractors)
└── pages/               # Top-level screen components mapped to React Router paths
```

### Why these folders exist:
* **`features/`**: Groups UI components, state queries, and types together by user feature. If a developer needs to modify how chat works, they edit files in `features/chat/`, without jumping between folders globally.
* **`components/ui/`**: Stores shadcn/radix primitives. Keeps design tokens localized.
* **`app/`**: Bootstraps the application, providing theme, socket, query, and context containers.
* **`store/`**: Separates Zustand stores (e.g., authentication, active connections) to keep state mutations simple.
