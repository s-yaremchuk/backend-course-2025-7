const http = require('http');
const express = require('express');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

// 1. Налаштування аргументів командного рядка
program
  .helpOption('-H, --HELP', 'display help for command')
  .requiredOption('-h, --host <host>', 'Server address')
  .requiredOption('-p, --port <port>', 'Server port')
  .requiredOption('-c, --cache <path>', 'Cache directory path');

program.parse(process.argv);
const options = program.opts();

// 2. Створення папки кешу
const cacheDir = path.resolve(options.cache);
if (!fs.existsSync(cacheDir)) {
  console.log(`Creating cache directory at: ${cacheDir}`);
  fs.mkdirSync(cacheDir, { recursive: true });
}

const app = express();

// --- НАЛАШТУВАННЯ SWAGGER ---
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory API',
      version: '1.0.0',
      description: 'API сервісу інвентаризації (Лабораторна робота №6)',
    },
    servers: [
      {
        url: `http://${options.host}:${options.port}`,
        description: 'Main Server'
      }
    ],
  },
  apis: [__filename], // Документація в цьому файлі
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 3. Сховище даних
let inventory = []; 
let idCounter = 1;

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



/**
 * @swagger 
 * components:
 *   schemas:
 *     InventoryItem:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Унікальний ID
 *         name:
 *           type: string
 *           description: Назва речі
 *         description:
 *           type: string
 *           description: Опис речі
 *         photo:
 *           type: string
 *           description: Ім'я файлу на диску
 *         photoUrl:
 *           type: string
 *           description: Посилання для перегляду фото
 */

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     tags: [Forms]
 *     summary: Отримати HTML форму реєстрації
 *     responses:
 *       200:
 *         description: HTML сторінка
 */
app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});


/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     tags: [Forms]
 *     summary: Отримати HTML форму пошуку
 *     responses:
 *       200:
 *         description: HTML сторінка
 */
app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

/**
 * @swagger
 * /register:
 *   post:
 *     tags: [Inventory]
 *     summary: Реєстрація нового пристрою
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request
 */
app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name) {
    return res.status(400).send('Bad Request: Inventory name is required');
  }

  const newItem = {
    id: idCounter++,
    name: inventory_name,
    description: description || '',
    photo: req.file ? req.file.filename : null
  };

  inventory.push(newItem);
  res.status(201).send('Created');
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     tags: [Inventory]
 *     summary: Отримати список всіх речей
 *     responses:
 *       200:
 *         description: Список речей
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/InventoryItem'
 */
app.get('/inventory', (req, res) => {
  const response = inventory.map(item => ({
    ...item,
    photoUrl: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
  }));
  res.status(200).json(response);
});


/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     tags: [Inventory]
 *     summary: Отримати річ за ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Знайдена річ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: Not Found
 */
app.get('/inventory/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) return res.status(404).send('Not Found');

  const response = {
    ...item,
    photoUrl: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
  };
  res.status(200).json(response);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     tags: [Inventory]
 *     summary: Отримати файл фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Зображення JPEG
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Not Found
 */
app.get('/inventory/:id/photo', (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item || !item.photo) return res.status(404).send('Not Found');

  const filePath = path.join(cacheDir, item.photo);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Photo file not found');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     tags: [Inventory]
 *     summary: Оновити дані речі (ім'я/опис)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name: 
 *                 type: string
 *               description: 
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not Found
 */
app.put('/inventory/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) return res.status(404).send('Not Found');

  const { inventory_name, description } = req.body;
  if (inventory_name) item.name = inventory_name;
  if (description) item.description = description;

  res.status(200).send('Updated');
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     tags: [Inventory]
 *     summary: Оновити лише фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo updated
 *       404:
 *         description: Not Found
 */
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) return res.status(404).send('Not Found');
  
  if (req.file) {
      item.photo = req.file.filename;
      res.status(200).send('Photo updated');
  } else {
      res.status(400).send('No photo uploaded');
  }
});


/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     tags: [Inventory]
 *     summary: Видалити річ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not Found
 */
app.delete('/inventory/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = inventory.findIndex(i => i.id === id);

  if (index === -1) return res.status(404).send('Not Found');

  inventory.splice(index, 1);
  res.status(200).send('Deleted');
});

/**
 * @swagger
 * /search:
 *   post:
 *     tags: [Search]
 *     summary: Пошук речі (x-www-form-urlencoded)
 *     requestBody:
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: ID для пошуку
 *               includePhoto:
 *                 type: string
 *                 description: Чекбокс ('on' додає лінк на фото)
 *     responses:
 *       200:
 *         description: Результат пошуку
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: Not Found
 */
app.post('/search', (req, res) => {
    const { id, includePhoto } = req.body; 

    const searchId = parseInt(id);
    const item = inventory.find(i => i.id === searchId);

    if (!item) {
        return res.status(404).json({ message: 'Not Found' });
    }

    let responseData = { ...item };
    
    // Логіка з прапорцем
    if (includePhoto === 'on' || includePhoto === true) {
        if (item.photo) {
            const photoLink = `http://${options.host}:${options.port}/inventory/${item.id}/photo`;
            responseData.description = `${responseData.description} (Фото: ${photoLink})`;
        }
    }

    res.status(200).json(responseData);
});

app.post('/hello', (req, res) => {
    // Читаємо ім'я з тіла запиту. Якщо не передали - буде "World"
    const name = req.body.name || 'World';
    
    res.send(`Hello ${name} via POST!`);
});

// Глобальна обробка 405/404
app.use((req, res, next) => {
    const knownPaths = ['/register', '/inventory', '/search', '/hello'];
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
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Swagger docs: http://${options.host}:${options.port}/docs`);
});