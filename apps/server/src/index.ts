import express from "express";
import { prisma } from "./db/client.js";

const app = express();
const port = process.env.PORT ?? 4000;

app.get("/health", async (_req, res) => {
  const userCount = await prisma.user.count();
  res.json({ status: "ok", userCount });
});

app.listen(port, () => {
  console.log(`server listening on port ${port}`);
});
