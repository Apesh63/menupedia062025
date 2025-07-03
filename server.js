require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Data storage
const DATA_FILE = path.join(__dirname, 'data.json');

// Ensure directories exist
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ meals: [], headings: [] }, null, 2));
}

// Connect to MongoDB
console.log('Attempting to connect to MongoDB...');
console.log('MongoDB URI exists:', !!process.env.MONGODB_URI);
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Define Mongoose schemas and models
const headingSchema = new mongoose.Schema({
  name: { type: String, required: true }
});
const Heading = mongoose.model('Heading', headingSchema);

const mealSchema = new mongoose.Schema({
  name: String,
  description: String,
  photo: String,
  halfServe: Boolean,
  heading: { type: mongoose.Schema.Types.ObjectId, ref: 'Heading' }
});
const Meal = mongoose.model('Meal', mealSchema);

function readData() {
    try {
        console.log('Reading data from:', DATA_FILE);
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const parsedData = JSON.parse(data);
        console.log('Successfully read data:', parsedData);
        return parsedData;
    } catch (error) {
        console.error('Error reading data:', error);
        const initialData = { meals: [], headings: [] };
        writeData(initialData);
        return initialData;
    }
}

function writeData(data) {
    try {
        console.log('Writing data to:', DATA_FILE);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('Successfully wrote data:', data);
        return true;
    } catch (error) {
        console.error('Error writing data:', error);
        return false;
    }
}

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads/');
    }
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Validate meal data
function validateMeal(meal) {
  const requiredFields = ['name', 'description'];
  for (const field of requiredFields) {
    if (!meal[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  return true;
}

// Routes
app.get('/api/data', async (req, res) => {
  try {
    const meals = await Meal.find();
    // For now, headings will be empty or static
    res.json({ meals, headings: [] });
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

app.get('/api/headings', async (req, res) => {
  try {
    const headings = await Heading.find();
    res.json(headings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/headings', async (req, res) => {
  try {
    const heading = new Heading({ name: req.body.name });
    await heading.save();
    res.json(heading);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/meals', upload.single('photo'), async (req, res) => {
  try {
    console.log('Received POST request for new meal');
    const mealData = JSON.parse(req.body.meal);
    if (req.file) {
      mealData.photo = `/uploads/${req.file.filename}`;
      console.log('Added photo:', mealData.photo);
    } else {
      mealData.photo = '';
    }
    if (req.body.heading) {
      mealData.heading = req.body.heading;
    }
    const meal = new Meal(mealData);
    await meal.save();
    res.json(meal);
  } catch (error) {
    console.error('Error saving meal:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/meals/:id', upload.single('photo'), async (req, res) => {
  try {
    const mealId = req.params.id;
    const updatedMealData = JSON.parse(req.body.meal);
    let meal = await Meal.findById(mealId);
    if (!meal) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    // Handle photo update
    if (req.file) {
      // Delete old photo if it exists
      if (meal.photo) {
        const oldPhotoPath = path.join(__dirname, meal.photo);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }
      updatedMealData.photo = `/uploads/${req.file.filename}`;
    } else {
      updatedMealData.photo = meal.photo;
    }

    // Update meal fields
    meal.set(updatedMealData);
    await meal.save();
    res.json(meal);
  } catch (error) {
    console.error('Error updating meal:', error);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/meals/:id', async (req, res) => {
  try {
    const mealId = req.params.id;
    const meal = await Meal.findById(mealId);
    if (!meal) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    // Delete associated image if it exists
    if (meal.photo) {
      const imagePath = path.join(__dirname, meal.photo);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await meal.deleteOne();
    res.json(meal);
  } catch (error) {
    console.error('Error deleting meal:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/headings/:id', async (req, res) => {
  try {
    const headingId = req.params.id;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Heading name is required' });
    }
    const heading = await Heading.findByIdAndUpdate(headingId, { name }, { new: true });
    if (!heading) {
      return res.status(404).json({ error: 'Heading not found' });
    }
    res.json(heading);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/headings/:id', async (req, res) => {
  try {
    const headingId = req.params.id;
    const heading = await Heading.findByIdAndDelete(headingId);
    if (!heading) {
      return res.status(404).json({ error: 'Heading not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  // Ensure data file exists with proper permissions
  if (!fs.existsSync(DATA_FILE)) {
    console.log('Creating initial data file');
    writeData({ meals: [], headings: [] });
  }
  
  // Ensure uploads directory exists
  if (!fs.existsSync('uploads')) {
    console.log('Creating uploads directory');
    fs.mkdirSync('uploads');
  }
  
  console.log(`Server is running on http://localhost:${port}`);
  console.log('Data file location:', path.resolve(DATA_FILE));
  console.log('Uploads directory:', path.resolve('uploads'));
});
