import app from "./app.js";

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`FinTracker API running on http://localhost:${PORT}`);
});
