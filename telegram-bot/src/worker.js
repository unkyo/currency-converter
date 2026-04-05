/**
 * Telegram bot on Cloudflare Workers.
 *
 * Env:
 * - BOT_TOKEN (secret)
 * - ADMIN_CHAT_ID (var)
 * - STATE (KV namespace)
 */

const API = "https://api.telegram.org/bot";
const STATE_TTL_SECONDS = 10 * 60;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}

function requireEnv(env, key) {
  const v = env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

async function tg(env, method, payload) {
  const token = requireEnv(env, "BOT_TOKEN");
  const res = await fetch(`${API}${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram API error: ${method}`);
  }
  return data;
}

function menuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Предложить идею", callback_data: "idea" }],
      [{ text: "Нужна помощь", callback_data: "help" }],
    ],
  };
}

async function setUserState(env, userId, state) {
  if (!env.STATE) return;
  const key = `u:${userId}`;
  await env.STATE.put(key, state, { expirationTtl: STATE_TTL_SECONDS });
}

async function getUserState(env, userId) {
  if (!env.STATE) return null;
  const key = `u:${userId}`;
  return await env.STATE.get(key);
}

async function clearUserState(env, userId) {
  if (!env.STATE) return;
  const key = `u:${userId}`;
  await env.STATE.delete(key);
}

function formatForward(prefix, msg) {
  const user = msg?.from || {};
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Unknown";
  const username = user.username ? `@${user.username}` : "";
  const id = user.id ? `id:${user.id}` : "";
  const text = msg?.text || "";
  return `${prefix}\nОт: ${name} ${username} ${id}\n\n${text}`.trim();
}

async function onStart(env, chatId) {
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: "Привет! Я бот конвертера валют. Чем помочь?",
    reply_markup: menuKeyboard(),
  });
}

async function onCallback(env, cb) {
  const data = cb?.data;
  const chatId = cb?.message?.chat?.id;
  const userId = cb?.from?.id;
  if (!chatId || !userId) return;

  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });

  if (data === "idea") {
    await setUserState(env, userId, "idea");
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: "Напишите вашу идею одним сообщением. Я передам её разработчику.",
    });
    return;
  }

  if (data === "help") {
    await setUserState(env, userId, "help");
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: "Опишите проблему одним сообщением (что не работает и на каком устройстве). Я передам разработчику.",
    });
    return;
  }
}

async function forwardToAdmin(env, prefix, msg) {
  const adminChatId = requireEnv(env, "ADMIN_CHAT_ID");
  const text = formatForward(prefix, msg);
  await tg(env, "sendMessage", { chat_id: adminChatId, text });
}

async function onMessage(env, msg) {
  const chatId = msg?.chat?.id;
  const userId = msg?.from?.id;
  const text = (msg?.text || "").trim();
  if (!chatId || !userId) return;

  if (text === "/start") {
    await onStart(env, chatId);
    return;
  }

  if (text === "/idea") {
    await setUserState(env, userId, "idea");
    await tg(env, "sendMessage", { chat_id: chatId, text: "Напишите вашу идею одним сообщением." });
    return;
  }

  if (text === "/help") {
    await setUserState(env, userId, "help");
    await tg(env, "sendMessage", { chat_id: chatId, text: "Опишите проблему одним сообщением." });
    return;
  }

  const st = await getUserState(env, userId);
  if (st === "idea") {
    await clearUserState(env, userId);
    await forwardToAdmin(env, "Новая идея", msg);
    await tg(env, "sendMessage", { chat_id: chatId, text: "Спасибо! Идея отправлена." });
    return;
  }

  if (st === "help") {
    await clearUserState(env, userId);
    await forwardToAdmin(env, "Запрос помощи", msg);
    await tg(env, "sendMessage", { chat_id: chatId, text: "Спасибо! Сообщение отправлено." });
    return;
  }

  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: "Выберите действие:",
    reply_markup: menuKeyboard(),
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");

    const update = await request.json().catch(() => null);
    if (!update) return new Response("Bad Request", { status: 400 });

    try {
      if (update.callback_query) await onCallback(env, update.callback_query);
      if (update.message) await onMessage(env, update.message);
    } catch (e) {
      // Do not leak details to callers
      return json({ ok: false }, { status: 200 });
    }

    return json({ ok: true });
  },
};

