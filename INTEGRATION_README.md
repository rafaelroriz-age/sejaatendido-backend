Integration instructions:

1) Configure backend URL in your frontend env.

- Web (Vite): set `VITE_API_URL` in the frontend `.env` to the backend public URL.
- Expo (React Native): set `EXPO_PUBLIC_API_URL`.

2) Run migrations and start backend:

- `npx prisma migrate dev` (local)
- `npx prisma migrate deploy` (production)

Note: `DIRECT_URL` is optional now; production deploys only require `DATABASE_URL`.

3) Mercado Pago checkout inside the app (Expo):

- Call `POST /pagamentos/mercadopago/checkout` (authenticated as PACIENTE) with `{ consultaId, valorCentavos? }`.
- The API returns `mercadopago.initPoint` (and `pagamento.id`).
- Open `initPoint` inside a `WebView` in the app.
- To confirm payment, poll `GET /pagamentos/{pagamentoId}` until `status === "PAGO"` (the webhook updates the DB asynchronously).

Obs: the return URL (`/pagamentos/mercadopago/retorno`) is used only as a fallback. The source of truth is the webhook + DB status.