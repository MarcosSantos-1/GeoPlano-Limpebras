# Portal Next.js

Aplicação Next.js voltada para visualizar os serviços NH, LE e VP em um mapa interativo com Leaflet e Tailwind.

## Pré-requisitos

- Node.js 18+ (sugestão: `nvm use 18`)
- pnpm, npm ou yarn (os exemplos abaixo usam `npm`)

## Instalação

```bash
cd portal
npm install
```

## Desenvolvimento

1. Gere os arquivos de dados com `python3 script.py` (na raiz do projeto de geração).
2. Copie o arquivo gerado `output/site/assets/data.json` para `portal/data/features.json`.
3. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

O site ficará disponível em `http://localhost:3000`.

## Produção

```bash
npm run build
npm run start
```

## Configuração extra

- A variável de ambiente `FEATURES_JSON_PATH` pode apontar para um caminho alternativo do arquivo JSON com os dados.
- Se o arquivo não estiver presente, a aplicação carrega um conjunto de dados de exemplo em `data/features.sample.json`.

