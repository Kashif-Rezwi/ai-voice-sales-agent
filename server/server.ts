import { createApplication } from "./app.js";

const { app, config } = createApplication();

app.listen(config.port, () => {
  console.log(`AI Voice Sales Agent listening on http://localhost:${config.port}`);
  console.log(`Intent provider: ${config.intentMode}`);
});
