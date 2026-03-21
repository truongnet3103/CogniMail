import type { RequestHandler } from "express";
import type { VerifyIdToken } from "../types";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const authMiddleware = (verifyIdToken: VerifyIdToken): RequestHandler => {
  return async (req, res, next) => {
    try {
      const authHeader = req.header("Authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

      if (!token) {
        res.status(401).json({ error: "Missing bearer token" });
        return;
      }

      const decoded = await verifyIdToken(token);
      req.userId = decoded.uid;
      next();
    } catch (error) {
      res.status(401).json({ error: "Invalid token", detail: (error as Error).message });
    }
  };
};
