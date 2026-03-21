import dotenv from "dotenv";
import { createApp, createDefaultDeps } from "./app";

dotenv.config();

const app = createApp(createDefaultDeps());
const port = Number.parseInt(process.env.PORT ?? "8080", 10);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on :${port}`);
});
