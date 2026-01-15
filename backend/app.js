import express from 'express';
import mustacheExpress from 'mustache-express';
import bodyParser from 'body-parser';
import path from 'path';
import connectDB from './db.js';
import surveyRoutes from './routes/survey.routes.js';
import responseRoutes from './routes/response.routes.js';
import dotenv from 'dotenv';
import logger from './middlewares/logger.js';
import session from 'express-session';
import FileStore from 'session-file-store';
dotenv.config();

const app = express();

// connexion MongoDB
connectDB();

/* VIEWS */
app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', path.resolve('frontend/views'));

/* STATIC FILES */
app.use('/assets', express.static(path.resolve('frontend/public')));

// Middleware pour parser POST
app.use(bodyParser.urlencoded({ extended: true })); // pour parser name="value[rowId][]"
app.use(bodyParser.json());

// Middleware global
//app.use(logger);

// Créer un store de fichiers
const FileStoreSession = FileStore(session);
app.use(session({

    secret: 'survey-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true
    }
  }));
/* ROUTES */
app.use('/survey', surveyRoutes);          // afficher questions
app.use('/survey', responseRoutes); // // CRUD réponses

export default app;
