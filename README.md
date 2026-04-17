# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

// Github Repo - Capstone Project

// Clone the Repo 
// (1) git clone --branch initial-progress https://github.com/lyl3n3th/Capstone-Project.git
// cd Capstone-Project

// install dependencies 

// -------------------------FRONT END----------

// (2) npm install (just this)

// (3) npm run dev (just this)

// (4) copy .env.example .env (chat me for API keys)

//----------------BACKEND--------------------

// cd backend

// python -m venv .venv (/)

// .venv\Scripts\activate.bat (/)

// pip install -r requirements.txt (/)

// mkdir logs (/)

// python manage.py migrate (/)

// python manage.py runserver (/)

// for automated backups, run the Celery worker and scheduler too

// celery -A aicsync worker -l info (/)

// celery -A aicsync beat -l info (/)

// if you are storing backup settings/history in Supabase:

// 1. run supabase/backup_operations_schema.sql in your Supabase SQL editor
// 2. set USE_SUPABASE_BACKUPS=true in backend .env
// 3. set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_BACKUP_BUCKET

// github process

// git checkout -b branch-name

//git add .

//git branch

//git commit -m "describe"

//git push -u origin branch-name

// just in case set up... 

// npm install axios @supabase/supabase-js react-icons

// cp .env.example .env

// pip install django djangorestframework

// pip install django-cors-headers

// pip install python-dotenv

// pip freeze > requirements.txt
