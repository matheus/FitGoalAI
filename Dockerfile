# Usa uma imagem leve do Node
FROM node:18-alpine

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos de dependência
COPY package*.json ./

# Instala dependências
# Instala build-base e python3 para compilar o better-sqlite3 se necessário em algumas arquiteturas
RUN apk add --no-cache python3 make g++ && \
    npm install --production

# Copia o resto do código
COPY . .

# Expõe a porta
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]