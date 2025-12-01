/**
 * Import function triggers from v2
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

admin.initializeApp();

// Inicializa o Gemini com a chave de ambiente (configurada no deploy)
// NUNCA coloque a string da chave direto aqui no código
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.generateWorkout = onCall({ cors: true, timeoutSeconds: 60, memory: "1GiB" }, async (request) => {
    // 1. Verificação de segurança (Opcional: exigir login)
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'O usuário precisa estar logado.');
    }

    const { currentImage, goalImage, frequency, duration } = request.data;

    if (!currentImage || !goalImage) {
        throw new HttpsError('invalid-argument', 'Imagens são obrigatórias.');
    }

    try {
        // 2. Configura o Modelo
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" } // Força resposta JSON
        });

        // 3. Monta o Prompt
        const prompt = `
            Atue como um treinador de elite e fisiologista.
            Analise a "Imagem A" (Corpo Atual) e a "Imagem B" (Meta).
            
            Contexto do Usuário:
            - Disponibilidade: ${frequency} dias por semana.
            - Duração do treino: ${duration} minutos.
            
            Tarefa:
            Crie um plano de treino completo para transformar o corpo A no corpo B.
            Identifique se o foco deve ser Hipertrofia (ganhar massa) ou Definição (perder gordura) baseado na comparação visual.
            
            Retorne APENAS um JSON com esta estrutura exata:
            {
                "title": "Nome do Programa (ex: Protocolo de Definição)",
                "analysis": "Sua análise comparativa breve do que precisa mudar no corpo.",
                "schedule": [
                    {
                        "day": "Dia 1",
                        "focus": "Foco do dia (ex: Peito e Tríceps)",
                        "exercises": [
                            { "name": "Nome Exercício", "sets": "Séries e Reps (ex: 4x12)" }
                        ]
                    }
                ]
            }
        `;

        // 4. Prepara as imagens para o Gemini
        const imageParts = [
            { inlineData: { data: currentImage, mimeType: "image/jpeg" } },
            { inlineData: { data: goalImage, mimeType: "image/jpeg" } }
        ];

        // 5. Gera o conteúdo
        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        const text = response.text();

        // 6. Retorna o JSON parseado para o Frontend
        return JSON.parse(text);

    } catch (error) {
        console.error("Erro no Gemini:", error);
        throw new HttpsError('internal', 'Falha ao processar com a IA.');
    }
});