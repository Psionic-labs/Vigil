import { betterAuth } from "better-auth";
import { pool } from "../db";

export const auth =
  process.env.NODE_ENV === "test"
    ? ({
        handler: async () => new Response("Mock Auth"),
        api: {
          getSession: async () => null,
          createUser: async () => ({ user: { id: "mock" } }),
          signUpEmail: async () => ({ user: { id: "mock" } }),
        },
      } as any)
    : betterAuth({
        database: pool,
        secret: process.env.BETTER_AUTH_SECRET || "development_secret_key_1234567890_vigil_app",
        baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001/api/auth",
        trustedOrigins: [
          "http://localhost:3002",
        ],
        emailAndPassword: {
          enabled: true,
        },
        socialProviders: {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID || "placeholder_id",
            clientSecret: process.env.GITHUB_CLIENT_SECRET || "placeholder_secret",
          },
        },
        user: {
          modelName: "users",
          fields: {
            emailVerified: "email_verified",
            createdAt: "created_at",
            updatedAt: "updated_at",
          },
        },
        session: {
          modelName: "auth_sessions",
          fields: {
            userId: "user_id",
            expiresAt: "expires_at",
            ipAddress: "ip_address",
            userAgent: "user_agent",
            createdAt: "created_at",
            updatedAt: "updated_at",
          },
        },
        account: {
          modelName: "accounts",
          fields: {
            userId: "user_id",
            accountId: "account_id",
            providerId: "provider_id",
            accessToken: "access_token",
            refreshToken: "refresh_token",
            idToken: "id_token",
            accessTokenExpiresAt: "access_token_expires_at",
            refreshTokenExpiresAt: "refresh_token_expires_at",
            createdAt: "created_at",
            updatedAt: "updated_at",
          },
        },
        verification: {
          modelName: "verifications",
          fields: {
            expiresAt: "expires_at",
            createdAt: "created_at",
            updatedAt: "updated_at",
          },
        },
      });
