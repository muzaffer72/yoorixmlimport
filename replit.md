# Overview

This is a full-stack web application for XML product import management, built with React (TypeScript) frontend and Express.js backend. The system allows users to manage XML data sources, map XML fields to local product schemas, import products from XML feeds, and schedule automated imports via cronjobs. It features a comprehensive dashboard for monitoring import activities and product statistics.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Radix UI primitives with shadcn/ui component library for consistent design
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation for type-safe form handling

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **API Design**: RESTful API with structured error handling and request logging middleware
- **Development**: Hot module replacement via Vite integration for seamless development experience

## Data Storage Solutions
- **Primary Database**: PostgreSQL configured via Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Schema Management**: Drizzle Kit for migrations and schema synchronization
- **Connection**: Database URL-based configuration with connection pooling

## Database Schema Design
The application uses a comprehensive schema for XML import management:
- **xmlSources**: Stores XML feed configurations with URL, status, and field mappings
- **products**: Main product catalog with pricing, inventory, and metadata
- **categories/brands**: Reference tables for product categorization
- **categoryMappings**: Maps XML category names to local category IDs
- **activityLogs**: Audit trail for all system operations and changes

## Authentication and Authorization
- Session-based authentication using Express sessions
- PostgreSQL session store for persistent session management
- User management with role-based access control structure in place

## Key Features Implementation
- **XML Processing**: xml2js library for parsing XML feeds into JavaScript objects
- **Field Mapping**: Dynamic JSON-based mapping system for XML tag translation
- **Import Scheduling**: Cronjob management for automated XML synchronization
- **Real-time Updates**: Activity logging system for tracking all import operations
- **Dashboard Analytics**: Statistical aggregation for monitoring system performance

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting with automatic scaling
- **Drizzle ORM**: Type-safe database toolkit with migration support

## UI and Styling
- **Radix UI**: Headless component primitives for accessibility and customization
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide React**: Icon library for consistent visual elements

## Development Tools
- **Vite**: Fast build tool with HMR and optimized bundling
- **TypeScript**: Static type checking across frontend and backend
- **ESBuild**: Fast JavaScript bundler for production builds

## Third-party Libraries
- **TanStack Query**: Server state management with caching and synchronization
- **React Hook Form**: Performant form library with validation
- **Zod**: Runtime type validation and schema definition
- **xml2js**: XML parsing and JavaScript object conversion
- **date-fns**: Date manipulation and formatting utilities

## Replit Integration
- **Development Banner**: Replit-specific development environment integration
- **Error Overlay**: Runtime error modal for development debugging
- **Cartographer**: Replit's code mapping tool for enhanced development experience