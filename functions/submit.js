// POST /submit  →  D1 저장 + 텔레그램 알림 + 카운터 +1
// 기존에 운영하던 텔레그램 봇/채팅방을 그대로 사용합니다. (TG_BOT_TOKEN / TG_CHAT_ID 환경변수)

const T36 = ["84K", "118K", "129K", "188K", "198PK"];
const TYPES_BY_BLOCK = {
  "1블록": ["84A","84B","84C","102A","102B","102C,D,E","124A","124B,C,D","128A,B,C","198PA","198PB"],
  "3블록": T36, "4블록": T36, "5블록": T36, "6블록": T36,
  "11블록": ["84H","84I","84J","100A","100B","100C","124H","124I","128H","198PC"],
};
const ALLOWED_BLOCKS = ["1블록","3블록","4블록","5블록","6블록","11블록","미정"];
const ALLOWED_TIME = ["언제나 가능","오전 09-12시","12시-15시","15시-18시","18시 이후"];

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  const json = (o, st) => new Response(JSON.stringify(o), {
    status: st || 200, headers: { "Content-Type": "application/json", ...cors },
  });

  try {
    const data = await request.json();
    const S = (v, n) => (v == null ? "" : String(v).trim().slice(0, n));

    const name         = S(data.name, 50);
    const phone        = S(data.phone, 30).replace(/[^0-9-]/g, "");
    const block        = S(data.block, 20);
    const type         = S(data.type, 80);
    const block2       = S(data.block2, 20);
    const type2        = S(data.type2, 80);
    const block3       = S(data.block3, 20);
    const type3        = S(data.type3, 80);
    const contact_time = S(data.contact_time, 40);
    const channel      = S(data.channel, 50);
    const utm_source   = S(data.utm_source, 100);
    const utm_medium   = S(data.utm_medium, 100);
    const utm_campaign = S(data.utm_campaign, 100);
    const referrer     = S(data.referrer, 300);
    const event_id     = S(data.event_id, 100);
    const page_url     = S(data.page_url, 300);

    if (!name || !phone) return json({ ok: false, error: "name/phone required" }, 400);
    if (!ALLOWED_BLOCKS.includes(block)) return json({ ok: false, error: "invalid block" }, 400);

    const createdAt = new Date(Date.now() + 9 * 3600 * 1000)
      .toISOString().replace("T", " ").slice(0, 19);

    await env.DB.prepare(
      `INSERT INTO leads
       (created_at, name, phone, block, type, block2, type2, block3, type3, contact_time, channel,
        utm_source, utm_medium, utm_campaign, referrer, event_id, page_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      createdAt, name, phone, block, type, block2, type2, block3, type3, contact_time, channel,
      utm_source, utm_medium, utm_campaign, referrer, event_id, page_url
    ).run();

    let count = 0;
    try {
      const row = await env.DB.prepare(
        "UPDATE stats SET v = v + 1 WHERE k = 'reservations' RETURNING v"
      ).first();
      if (row && row.v) count = row.v;
    } catch (e) { console.error("count error:", e); }

    /* ── 텔레그램 알림 : 현장명 · 이름 · 연락처 · 순위별 블록/평형 · 연락가능시간 ── */
    const site = env.SITE_NAME || "더샵 송도그란테르";
    const rank = (b, t) => (b || t) ? `${b || "-"} · ${t || "-"}` : "-";
    const msg =
      `🔔 [${site}] 신규 사전예약 등록\n` +
      `━━━━━━━━━━━━━━━\n` +
      `👤 이름 : ${name}\n` +
      `📞 연락처 : ${phone}\n` +
      `🏢 관심블록·평형\n` +
      `   1순위 : ${rank(block, type)}\n` +
      `   2순위 : ${rank(block2, type2)}\n` +
      `   3순위 : ${rank(block3, type3)}\n` +
      `🕒 연락가능 : ${contact_time || "-"}\n` +
      `📊 유입경로 : ${channel || "-"}\n` +
      (utm_source ? `🔗 광고 : ${utm_source}${utm_medium ? " / " + utm_medium : ""}${utm_campaign ? " / " + utm_campaign : ""}\n` : "") +
      `🕐 ${createdAt} (KST)`;

    try {
      context.waitUntil(
        fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: msg, disable_web_page_preview: true }),
        }).catch(function (e) { console.error("Telegram error:", e); })
      );
    } catch (e) { console.error("Telegram error:", e); }

    return json({ ok: true, count });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
