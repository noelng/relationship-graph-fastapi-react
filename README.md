## Steps to run the file locally

cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000

cd frontend
npm run dev

## 📋 Complete Frontend File Structure

After a proper Vite setup, you should have:
```
frontend/
├── node_modules/          (created by npm install)
├── public/
│   └── vite.svg
├── src/
│   ├── App.css           (can delete this)
│   ├── App.jsx           (replace with our code)
│   ├── index.css         (update with Tailwind directives)
│   └── main.jsx          (keep as is)
├── .gitignore
├── index.html            ← THIS FILE SHOULD BE HERE
├── package.json
├── package-lock.json
├── vite.config.js
├── tailwind.config.js    (create manually)
└── postcss.config.js     (create manually)

## Improvement to make
1.	arrow to indicate the direction of the relationship 
2.	different color for line and relationship, line type (dotted, bold)
3.	how to identify person or company 
4.	database support 


## Good to maintain 
1.	size to indicate the later of relationship 
2.	bold icon to indicate expanded companies