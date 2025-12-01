const express = require('express');
const multer = require('multer');
const Database = require('better-sqlite3');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

// Configuração Básica
const app = express();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // Limite 5MB
const PORT = process.env.PORT || 3000;

// Middleware de Log (DIAGNÓSTICO: Mostra quem está acessando o servidor)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Request recebido: ${req.method} ${req.url}`);
    next();
});

// --- CORREÇÃO: Cria a pasta 'data' ANTES de tentar abrir o banco ---
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    console.log(`Criando diretório de dados em: ${dataDir}`);
    fs.mkdirSync(dataDir);
}

// Inicializa Banco de Dados SQLite
const db = new Database(path.join(dataDir, 'fitgoal.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    analysis TEXT,
    full_plan_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Middleware para servir arquivos estáticos (Frontend)
app.use(express.static('public'));
app.use(express.json());

// Rota de Health Check (Prioritária para o EasyPanel)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Rota Fallback para a Raiz (Caso o index.html falhe, o servidor ainda responde 200)
app.get('/', (req, res) => {
    res.status(200).send('FitGoal AI Server is Running. (Frontend not found via static)');
});

// Rota: Gerar Treino
app.post('/api/generate-workout', upload.none(), async (req, res) => {
    try {
        const { currentImage, goalImage, frequency, duration } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "Chave de API não configurada no servidor." });
        }

        // Inicializa IA
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        // Prompt
        const prompt = `
            Atue como um treinador de elite.
            Analise a "Imagem A" (Corpo Atual) e a "Imagem B" (Meta).
            Contexto: ${frequency} dias/semana, ${duration} min/treino.
            Crie um plano JSON para transformar o corpo A no corpo B.
            Estrutura JSON Obrigatória:
            {
                "title": "Nome do Treino",
                "analysis": "Análise breve",
                "schedule": [
                    { "day": "Dia 1", "focus": "Foco", "exercises": [{ "name": "Exercicio", "sets": "4x10" }] }
                ]
            }
        `;

        // Prepara imagens (Remove header base64 se existir)
        const cleanBase64 = (str) => str.replace(/^data:image\/\w+;base64,/, "");

        const imageParts = [
            { inlineData: { data: cleanBase64(currentImage), mimeType: "image/jpeg" } },
            { inlineData: { data: cleanBase64(goalImage), mimeType: "image/jpeg" } }
        ];

        // Chama Gemini
        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text();
        const workoutJson = JSON.parse(responseText);

        // Salva no SQLite
        const insert = db.prepare('INSERT INTO workouts (title, analysis, full_plan_json) VALUES (?, ?, ?)');
        insert.run(workoutJson.title, workoutJson.analysis, JSON.stringify(workoutJson));

        res.json(workoutJson);

    } catch (error) {
        console.error("Erro no servidor:", error);
        res.status(500).json({ error: error.message });
    }
});

// Rota: Histórico (Opcional)
app.get('/api/history', (req, res) => {
    const rows = db.prepare('SELECT * FROM workouts ORDER BY created_at DESC LIMIT 5').all();
    const history = rows.map(row => ({
        ...row,
        plan: JSON.parse(row.full_plan_json)
    }));
    res.json(history);
});

// Iniciar Servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT} (0.0.0.0)`);
    console.log(`Diretório de dados: ${dataDir}`);
});

// Tratamento Gracioso de Shutdown (Evita erros feios de SIGTERM no log)
process.on('SIGTERM', () => {
    console.log('SIGTERM recebido. Fechando servidor...');
    server.close(() => {
        console.log('Servidor fechado.');
        db.close();
        process.exit(0);
    });
});