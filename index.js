require('dotenv').config(); // [cite: 18]
const http = require('http');
const express = require('express');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { Pool } = require('pg'); // [cite: 7]

// 1. Налаштування аргументів (залишаємо для сумісності, але пріоритет у .env)
program
  .option('-h, --host <host>', 'Server address', process.env.HOST || '0.0.0.0')
  .option('-p, --port <port>', 'Server port', process.env.PORT || '3000')
  .option('-c, --cache <path>', 'Cache directory path', process.env.CACHE_DIR || 'cache');

program.parse(process.argv);
const options = program.opts();

// 2. Створення папки кешу
const cacheDir = path.resolve(options.cache);
if (!fs.existsSync(cacheDir)) {
  console.log(`Creating cache directory at: ${cacheDir}`);
  fs.mkdirSync(cacheDir, { recursive: true });
}

// 3. Підключення до Бази Даних
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT,
});

// Перевірка з'єднання
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to PostgreSQL database successfully');
  release();
});

const app = express();

// --- НАЛАШТУВАННЯ SWAGGER ---
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory API',
      version: '1.0.0',
      description: 'API сервісу інвентаризації (Lab 7: Docker + DB)',
    },
    servers: [
      {
        url: `http://localhost:${options.port}`,
        description: 'Main Server'
      }
    ],
  },
  apis: [__filename],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 4. Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, cacheDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- HTML FORM ROUTES ---
app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

// --- API ROUTES ---

/**
 * @swagger
 * /register:
 * post:
 * tags: [Inventory]
 * summary: Реєстрація нового пристрою (DB)
 * requestBody:
 * content:
 * multipart/form-data:
 * schema:
 * type: object
 * required:
 * - inventory_name
 * properties:
 * inventory_name:
 * type: string
 * description:
 * type: string
 * photo:
 * type: string
 * format: binary
 * responses:
 * 201:
 * description: Created
 * 400:
 * description: Bad Request
 */
app.post('/register', upload.single('photo'), async (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name) {
    return res.status(400).send('Bad Request: Inventory name is required');
  }

  const photoFilename = req.file ? req.file.filename : null;

  try {
    const query = 'INSERT INTO inventory (name, description, photo) VALUES ($1, $2, $3) RETURNING *';
    const values = [inventory_name, description || '', photoFilename];
    await pool.query(query, values);
    res.status(201).send('Created');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @swagger
 * /inventory:
 * get:
 * tags: [Inventory]
 * summary: Отримати список всіх речей (DB)
 * responses:
 * 200:
 * description: Список речей
 */
app.get('/inventory', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM inventory ORDER BY id ASC');
    const response = result.rows.map(item => ({
      ...item,
      photoUrl: item.photo ? `http://localhost:${options.port}/inventory/${item.id}/photo` : null
    }));
    res.status(200).json(response);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 * get:
 * tags: [Inventory]
 * summary: Отримати річ за ID (DB)
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: integer
 * responses:
 * 200:
 * description: Знайдена річ
 * 404:
 * description: Not Found
 */
app.get('/inventory/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  
  try {
    const result = await pool.query('SELECT * FROM inventory WHERE id = $1', [id]);
    
    if (result.rows.length === 0) return res.status(404).send('Not Found');
    
    const item = result.rows[0];
    const response = {
        ...item,
        photoUrl: item.photo ? `http://localhost:${options.port}/inventory/${item.id}/photo` : null
    };
    res.status(200).json(response);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 * get:
 * tags: [Inventory]
 * summary: Отримати файл фото
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: integer
 * responses:
 * 200:
 * description: Зображення JPEG
 */
app.get('/inventory/:id/photo', async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await pool.query('SELECT photo FROM inventory WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].photo) {
        return res.status(404).send('Not Found');
    }

    const filename = result.rows[0].photo;
    const filePath = path.join(cacheDir, filename);

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.sendFile(filePath);
    } else {
      res.status(404).send('Photo file not found on disk');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 * put:
 * tags: [Inventory]
 * summary: Оновити дані речі (ім'я/опис)
 */
app.put('/inventory/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { inventory_name, description } = req.body;

  try {
    // Динамічне формування запиту, щоб оновлювати лише передані поля
    let fields = [];
    let values = [];
    let idx = 1;

    if (inventory_name) {
        fields.push(`name = $${idx++}`);
        values.push(inventory_name);
    }
    if (description) {
        fields.push(`description = $${idx++}`);
        values.push(description);
    }

    if (fields.length === 0) return res.status(400).send('No fields to update');

    values.push(id);
    const query = `UPDATE inventory SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rowCount === 0) return res.status(404).send('Not Found');
    
    res.status(200).send('Updated');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 * put:
 * tags: [Inventory]
 * summary: Оновити лише фото
 */
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  const id = parseInt(req.params.id);

  if (!req.file) return res.status(400).send('No photo uploaded');

  try {
    const query = 'UPDATE inventory SET photo = $1 WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [req.file.filename, id]);

    if (result.rowCount === 0) return res.status(404).send('Not Found');

    res.status(200).send('Photo updated');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 * delete:
 * tags: [Inventory]
 * summary: Видалити річ
 */
app.delete('/inventory/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await pool.query('DELETE FROM inventory WHERE id = $1 RETURNING *', [id]);
    
    if (result.rowCount === 0) return res.status(404).send('Not Found');
    
    // Опціонально: тут можна додати видалення файлу з диска (fs.unlink)
    res.status(200).send('Deleted');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @swagger
 * /search:
 * post:
 * tags: [Search]
 * summary: Пошук речі
 */
app.post('/search', async (req, res) => {
    const { id, includePhoto } = req.body; 
    const searchId = parseInt(id);

    try {
        const result = await pool.query('SELECT * FROM inventory WHERE id = $1', [searchId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Not Found' });
        }

        let item = result.rows[0];
        let responseData = { ...item };
        
        if (includePhoto === 'on' || includePhoto === true || includePhoto === 'true') {
            if (item.photo) {
                const photoLink = `http://localhost:${options.port}/inventory/${item.id}/photo`;
                responseData.description = `${responseData.description} (Фото: ${photoLink})`;
            }
        }

        res.status(200).json(responseData);
    } catch (err) {
        console.error(err);
        res.status(500).send('Database Error');
    }
});

// Глобальна обробка 405/404
app.use((req, res, next) => {
    const knownPaths = ['/register', '/inventory', '/search'];
    const pathBase = '/' + req.path.split('/')[1]; 
    
    if (knownPaths.includes(pathBase)) {
        res.status(405).send('Method Not Allowed');
    } else {
        res.status(404).send('Page Not Found');
    }
});

// Запуск сервера
const server = http.createServer(app);
server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://${options.host}:${options.port}`);
  console.log(`Swagger docs: http://localhost:${options.port}/docs`);
});