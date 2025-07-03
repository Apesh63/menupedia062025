require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Define the Meal schema (should match the one in server.js)
const mealSchema = new mongoose.Schema({
  name: String,
  description: String,
  photo: String,
  halfServe: Boolean
});
const Meal = mongoose.model('Meal', mealSchema);

// Read meals from data.json
const dataPath = path.join(__dirname, 'data.json');
const rawData = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(rawData);
const meals = data.meals || [];

async function migrate() {
  try {
    // Optional: Remove all existing meals before import
    // await Meal.deleteMany({});
    const result = await Meal.insertMany(meals);
    console.log(`Successfully imported ${result.length} meals.`);
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    mongoose.disconnect();
  }
}

migrate(); 