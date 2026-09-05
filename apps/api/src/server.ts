import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyHealthcheck from "fastify-healthcheck";
import { ZodError } from "zod";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: { info: { title: "GroundGraph API", version: "0.1.0" } },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(fastifyHealthcheck);

  app.get("/healthz", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  app.get("/ready", async () => {
    return { status: "ready", timestamp: new Date().toISOString() };
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        message: error.issues,
      });
    }

    return reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  });

  return app;
}
