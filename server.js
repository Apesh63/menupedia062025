const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

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
app.get('/api/data', (req, res) => {
  try {
    const data = readData();
    res.json(data);
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

app.post('/api/meals', upload.single('photo'), (req, res) => {
  try {
    console.log('Received POST request for new meal');
    const data = readData();
    const meal = JSON.parse(req.body.meal);
    
    if (req.file) {
      meal.photo = `/uploads/${req.file.filename}`;
      console.log('Added photo:', meal.photo);
    } else {
      meal.photo = '';
    }

    data.meals.push(meal);
    console.log('Added new meal:', meal);
    
    if (!writeData(data)) {
      throw new Error('Failed to save data');
    }

    res.json(meal);
  } catch (error) {
    console.error('Error saving meal:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/meals/:id', upload.single('photo'), (req, res) => {
  try {
    const data = readData();
    const mealIndex = parseInt(req.params.id);
    
    if (mealIndex >= 0 && mealIndex < data.meals.length) {
      const updatedMeal = JSON.parse(req.body.meal);
      
      // Keep existing photo if no new photo is uploaded
      if (req.file) {
        // Delete old photo if it exists
        if (data.meals[mealIndex].photo) {
          const oldPhotoPath = path.join(__dirname, data.meals[mealIndex].photo);
          if (fs.existsSync(oldPhotoPath)) {
            fs.unlinkSync(oldPhotoPath);
          }
        }
        updatedMeal.photo = `/uploads/${req.file.filename}`;
      } else {
        updatedMeal.photo = data.meals[mealIndex].photo;
      }
      
      data.meals[mealIndex] = updatedMeal;
      
      if (!writeData(data)) {
        throw new Error('Failed to save data');
      }
      
      res.json(updatedMeal);
    } else {
      res.status(404).json({ error: 'Meal not found' });
    }
  } catch (error) {
    console.error('Error updating meal:', error);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/meals/:id', (req, res) => {
  try {
    const data = readData();
    const mealIndex = parseInt(req.params.id);
    
    if (mealIndex >= 0 && mealIndex < data.meals.length) {
      const deletedMeal = data.meals[mealIndex];
      
      // Delete associated image if it exists
      if (deletedMeal.photo) {
        const imagePath = path.join(__dirname, deletedMeal.photo);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
      data.meals.splice(mealIndex, 1);
      
      if (!writeData(data)) {
        throw new Error('Failed to save data');
      }
      
      res.json(deletedMeal);
    } else {
      res.status(404).json({ error: 'Meal not found' });
    }
  } catch (error) {
    console.error('Error deleting meal:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/headings', (req, res) => {
  try {
    const data = readData();
    data.headings = req.body.headings;
    
    if (!writeData(data)) {
      throw new Error('Failed to save data');
    }
    
    res.json(data.headings);
  } catch (error) {
    console.error('Error updating headings:', error);
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
