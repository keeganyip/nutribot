import { useState, useRef, useEffect, useCallback } from "react";

const buildSystemPrompt = (currentWeightKg) => `You are NutriBot, a no-BS AI nutrition agent with computer vision. The user is trying to GAIN WEIGHT while staying healthy.
Current body weight: ${currentWeightKg}kg.
Daily targets:
- Calories: 3000-3500 kcal
- Protein: 150-180g (critical for muscle gain)
- Carbs: 350-450g
- Fats: 80-120g
- Fiber: 30-40g

When analyzing meal images:
- BEFORE only: estimate the full meal nutrition as if they ate it all
- BEFORE + AFTER: compare the two images carefully. Estimate what percentage was consumed based on what's missing/remaining. Adjust nutrition accordingly.
- Be specific about what you can see in the image(s)
- If unsure about portion size, err on the generous side (they're bulking)

ALWAYS respond ONLY in this exact JSON format, no extra text, no markdown fences:
{
  "reply": "brief, direct reply — identify what you see, be a little funny/motivating",
  "foods": [
    {
      "name": "food item",
      "amount": "estimated portion",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number,
      "fiber": number
    }
  ],
  "consumed_pct": number (0-100, how much of the before meal was eaten — 100 if no after photo),
  "action": "log" | "question" | "summary" | "tip"
}

For non-image chat messages, set foods to [] and consumed_pct to 100.`;

const GOALS = { calories: 3200, protein: 165, carbs: 400, fats: 100, fiber: 35 };

const toBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

const blobToBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

const aggregateTotals = (entries) => entries.reduce((acc, entry) => {
  (entry.foods || []).forEach((food) => {
    acc.calories += food.calories || 0;
    acc.protein += food.protein || 0;
    acc.carbs += food.carbs || 0;
    acc.fats += food.fats || 0;
    acc.fiber += food.fiber || 0;
  });
  return acc;
}, { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 });

const MacroBar = ({ label, current, goal, color, unit = "g" }) => {
  const pct = Math.min((current / goal) * 100, 100);
  const over = current > goal;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 1 }}>
        <span style={{ color: "#666", textTransform: "uppercase" }}>{label}</span>
        <span style={{ color: over ? "#ff6b6b" : "#ccc" }}>
          {Math.round(current)}<span style={{ color: "#444" }}>/{goal}{unit}</span>
        </span>
      </div>
      <div style={{ background: "#1a1a1a", borderRadius: 2, height: 5, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: over ? "#ff6b6b" : color,
          transition: "width 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: `0 0 6px ${color}55`
        }} />
      </div>
    </div>
  );
};

const MealCard = ({ entry, onStartEdit }) => (
  <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
    {(entry.beforeUrl || entry.afterUrl) && (
      <div style={{ display: "flex", gap: 2 }}>
        {entry.beforeUrl && (
          <div style={{ position: "relative", flex: 1 }}>
            <img src={entry.beforeUrl} alt="before" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", bottom: 4, left: 4, background: "#c8f564", color: "#080808", fontSize: 8, fontFamily: "'Space Mono', monospace", fontWeight: 700, padding: "2px 5px", borderRadius: 2 }}>BEFORE</div>
          </div>
        )}
        {entry.afterUrl && (
          <div style={{ position: "relative", flex: 1 }}>
            <img src={entry.afterUrl} alt="after" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", bottom: 4, left: 4, background: "#60d0ff", color: "#080808", fontSize: 8, fontFamily: "'Space Mono', monospace", fontWeight: 700, padding: "2px 5px", borderRadius: 2 }}>AFTER</div>
          </div>
        )}
      </div>
    )}
    <div style={{ padding: "10px 12px" }}>
      {entry.foods.map((f, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < entry.foods.length - 1 ? "1px solid #141414" : "none" }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#c8f564" }}>{f.name}</div>
            <div style={{ fontSize: 9, color: "#444", fontFamily: "'Space Mono', monospace" }}>{f.amount}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#fff" }}>{f.calories} <span style={{ color: "#444", fontSize: 9 }}>kcal</span></div>
            <div style={{ fontSize: 9, color: "#555", fontFamily: "'Space Mono', monospace" }}>P:{Math.round(f.protein)}g C:{Math.round(f.carbs)}g F:{Math.round(f.fats)}g</div>
          </div>
        </div>
      ))}
      {entry.consumed_pct < 100 && (
        <div style={{ marginTop: 6, fontSize: 9, color: "#f5a623", fontFamily: "'Space Mono', monospace" }}>
          ⚠ ~{entry.consumed_pct}% consumed — adjusted for leftovers
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: 9, color: "#333", fontFamily: "'Space Mono', monospace" }}>{entry.time}</div>
      {entry.beforeUrl && !entry.afterUrl && (
        <button
          onClick={() => onStartEdit(entry.id)}
          style={{
            marginTop: 8,
            background: "transparent",
            border: "1px solid #60d0ff",
            color: "#60d0ff",
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            letterSpacing: 1,
            padding: "5px 8px",
            borderRadius: 3,
            cursor: "pointer"
          }}
        >
          + ADD AFTER PHOTO
        </button>
      )}
    </div>
  </div>
);

const DropZone = ({ label, color, preview, onChange, onRemove }) => {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) onChange(file);
  }, [onChange]);

  if (preview) return (
    <div style={{ position: "relative", flex: 1 }}>
      <img src={preview} alt={label} style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, border: `2px solid ${color}`, display: "block" }} />
      <div style={{ position: "absolute", bottom: 4, left: 4, background: color, color: "#080808", fontSize: 8, fontFamily: "'Space Mono', monospace", fontWeight: 700, padding: "2px 5px", borderRadius: 2 }}>{label}</div>
      <button onClick={onRemove} style={{ position: "absolute", top: 4, right: 4, background: "#ff444488", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
    </div>
  );

  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      style={{
        flex: 1, height: 90, border: `2px dashed ${drag ? color : "#222"}`,
        borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", cursor: "pointer", background: drag ? `${color}11` : "#0a0a0a",
        transition: "all 0.2s", gap: 3
      }}
    >
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f); e.target.value = ""; }} />
      <div style={{ fontSize: 18 }}>{label === "BEFORE" ? "📸" : "🍽️"}</div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: color, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#333" }}>tap or drop</div>
    </div>
  );
};

export default function NutritionAgent() {
  const [currentWeightKg, setCurrentWeightKg] = useState(48);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Yo. I'm your vision-powered nutrition agent. You're starting at 48kg in gain mode. Add a meal first (before photo), then edit later with an after photo if you didn't finish. 📸💪" }
  ]);
  const [apiMessages, setApiMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mealLog, setMealLog] = useState([]);
  const [tab, setTab] = useState("chat");
  const [beforeFile, setBeforeFile] = useState(null);
  const [afterFile, setAfterFile] = useState(null);
  const [beforePreview, setBeforePreview] = useState(null);
  const [afterPreview, setAfterPreview] = useState(null);
  const [editingMealId, setEditingMealId] = useState(null);
  const [editAfterFile, setEditAfterFile] = useState(null);
  const [editAfterPreview, setEditAfterPreview] = useState(null);
  const [updatingMeal, setUpdatingMeal] = useState(false);
  const chatRef = useRef(null);

  const totals = aggregateTotals(mealLog);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  const handleBeforeImg = (file) => { setBeforeFile(file); setBeforePreview(URL.createObjectURL(file)); };
  const handleAfterImg = (file) => { setAfterFile(file); setAfterPreview(URL.createObjectURL(file)); };
  const handleEditAfterImg = (file) => { setEditAfterFile(file); setEditAfterPreview(URL.createObjectURL(file)); };

  const buildImageContentFromUrl = async (imageUrl) => {
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();
    const imageB64 = await blobToBase64(imageBlob);
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: imageBlob.type || "image/jpeg",
        data: imageB64
      }
    };
  };

  const requestNutritionAnalysis = async (contentArr, messagesForApi) => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: buildSystemPrompt(currentWeightKg),
        messages: [...messagesForApi, { role: "user", content: contentArr }]
      })
    });

    const data = await response.json();
    const rawText = data.content?.map(b => b.text || "").join("") || "{}";

    let parsed;
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : rawText);
    } catch {
      parsed = { reply: rawText, foods: [], consumed_pct: 100, action: "question" };
    }

    return { parsed, rawText, userApiMessage: { role: "user", content: contentArr } };
  };

  const canSend = !loading && (input.trim() || beforeFile);

  const sendMessage = async () => {
    if (!canSend) return;
    setLoading(true);

    const userText = input.trim();
    const hasBefore = !!beforeFile;
    const hasAfter = !!afterFile;

    const displayParts = [];
    if (userText) displayParts.push(userText);
    if (hasBefore) displayParts.push("📸 Before photo");
    if (hasAfter) displayParts.push("🍽️ After photo");

    const savedBefore = beforePreview;
    const savedAfter = afterPreview;

    setMessages(prev => [...prev, { role: "user", content: displayParts.join(" · "), beforeUrl: savedBefore, afterUrl: savedAfter }]);

    const contentArr = [];
    if (hasBefore) {
      const b64 = await toBase64(beforeFile);
      contentArr.push({ type: "image", source: { type: "base64", media_type: beforeFile.type || "image/jpeg", data: b64 } });
      contentArr.push({ type: "text", text: "This is the BEFORE photo — the meal as served/plated." });
    }
    if (hasAfter) {
      const b64 = await toBase64(afterFile);
      contentArr.push({ type: "image", source: { type: "base64", media_type: afterFile.type || "image/jpeg", data: b64 } });
      contentArr.push({ type: "text", text: "This is the AFTER photo — what remained on the plate." });
    }
    contentArr.push({
      type: "text",
      text: userText ? (hasBefore ? `User added context: ${userText}` : userText) : (hasBefore ? "Analyze this meal and log the nutrition." : "")
    });

    setInput(""); setBeforeFile(null); setAfterFile(null); setBeforePreview(null); setAfterPreview(null);

    try {
      const { parsed, rawText, userApiMessage } = await requestNutritionAnalysis(contentArr, apiMessages);

      setMessages(prev => [...prev, { role: "assistant", content: parsed.reply || "Got it." }]);
      setApiMessages(prev => [...prev, userApiMessage, { role: "assistant", content: rawText }]);

      if (parsed.foods?.length > 0) {
        const newEntry = {
          id: Date.now(),
          foods: parsed.foods,
          consumed_pct: parsed.consumed_pct ?? 100,
          beforeUrl: savedBefore,
          afterUrl: savedAfter,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setMealLog(prev => [...prev, newEntry]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]);
    }
    setLoading(false);
  };

  const startEditingMeal = (mealId) => {
    setEditingMealId(mealId);
    setEditAfterFile(null);
    setEditAfterPreview(null);
    setTab("log");
  };

  const cancelMealEdit = () => {
    setEditingMealId(null);
    setEditAfterFile(null);
    setEditAfterPreview(null);
  };

  const saveAfterForMeal = async () => {
    if (!editingMealId || !editAfterFile || updatingMeal) return;
    const targetMeal = mealLog.find((meal) => meal.id === editingMealId);
    if (!targetMeal?.beforeUrl) return;

    setUpdatingMeal(true);
    try {
      const beforeImage = await buildImageContentFromUrl(targetMeal.beforeUrl);
      const afterB64 = await toBase64(editAfterFile);
      const contentArr = [
        beforeImage,
        { type: "text", text: "This is the BEFORE photo — the meal as served/plated." },
        { type: "image", source: { type: "base64", media_type: editAfterFile.type || "image/jpeg", data: afterB64 } },
        { type: "text", text: "This is the AFTER photo — what remained on the plate." },
        { type: "text", text: "Re-analyze this exact same meal with the after photo and update consumed percentage." }
      ];

      const { parsed, rawText, userApiMessage } = await requestNutritionAnalysis(contentArr, apiMessages);
      const newAfterUrl = editAfterPreview;

      setMealLog((prev) => prev.map((meal) => (
        meal.id === editingMealId
          ? {
            ...meal,
            foods: parsed.foods?.length ? parsed.foods : meal.foods,
            consumed_pct: parsed.consumed_pct ?? meal.consumed_pct,
            afterUrl: newAfterUrl || meal.afterUrl,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
          : meal
      )));

      setMessages(prev => [...prev, { role: "assistant", content: parsed.reply || "Meal updated with after photo." }]);
      setApiMessages(prev => [...prev, userApiMessage, { role: "assistant", content: rawText }]);
      cancelMealEdit();
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Couldn't update that meal right now. Try again." }]);
    }
    setUpdatingMeal(false);
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const resetDay = () => {
    setMealLog([]);
    setMessages([{ role: "assistant", content: "Day reset. Fresh start. Keep pushing up from 48kg. 🔄" }]);
    setApiMessages([]);
    cancelMealEdit();
  };
  const calPct = Math.round((totals.calories / GOALS.calories) * 100);

  return (
    <div style={{ background: "#080808", minHeight: "100vh", color: "#e0e0e0", fontFamily: "'Space Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 12px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Barlow+Condensed:wght@300;500;700;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ width: "100%", maxWidth: 820, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: 4, color: "#c8f564", lineHeight: 1 }}>NUTRIBOT</div>
          <div style={{ fontSize: 9, color: "#333", letterSpacing: 3, marginTop: 2 }}>VISION · BULK MODE · SNAP & TRACK</div>
        </div>
        <button onClick={resetDay} style={{ background: "transparent", border: "1px solid #1e1e1e", color: "#333", fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, padding: "5px 10px", cursor: "pointer", borderRadius: 2 }}>↺ RESET</button>
      </div>

      <div style={{ width: "100%", maxWidth: 820, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {/* LEFT: Stats Panel */}
        <div style={{ flex: "1 1 230px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 8, padding: 18 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#333", textTransform: "uppercase", marginBottom: 14 }}>TODAY'S INTAKE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div style={{ position: "relative", width: 74, height: 74, flexShrink: 0 }}>
                <svg width="74" height="74" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="37" cy="37" r="31" fill="none" stroke="#161616" strokeWidth="6" />
                  <circle cx="37" cy="37" r="31" fill="none" stroke="#c8f564" strokeWidth="6"
                    strokeDasharray={`${Math.min(calPct, 100) * 1.948} 194.8`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.7s ease", filter: "drop-shadow(0 0 5px #c8f564)" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, color: "#c8f564" }}>{calPct}%</div>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 28, color: "#fff", lineHeight: 1 }}>{Math.round(totals.calories)}</div>
                <div style={{ fontSize: 9, color: "#444" }}>/ {GOALS.calories} kcal</div>
                <div style={{ fontSize: 9, color: totals.calories >= GOALS.calories ? "#c8f564" : "#444", marginTop: 4 }}>
                  {totals.calories >= GOALS.calories ? "✓ GOAL HIT 🔥" : `${GOALS.calories - Math.round(totals.calories)} left`}
                </div>
              </div>
            </div>
            <MacroBar label="Protein" current={totals.protein} goal={GOALS.protein} color="#60d0ff" />
            <MacroBar label="Carbs" current={totals.carbs} goal={GOALS.carbs} color="#f5a623" />
            <MacroBar label="Fats" current={totals.fats} goal={GOALS.fats} color="#ff7eb3" />
            <MacroBar label="Fiber" current={totals.fiber} goal={GOALS.fiber} color="#78ff9b" />
          </div>

          <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#333", marginBottom: 10, textTransform: "uppercase" }}>GAIN PROFILE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>⚖️</span>
              <span style={{ fontSize: 9, color: "#666" }}>Current weight:</span>
              <input
                type="number"
                min="30"
                max="200"
                value={currentWeightKg}
                onChange={(e) => setCurrentWeightKg(Number(e.target.value) || 48)}
                style={{ width: 56, background: "#0a0a0a", border: "1px solid #1e1e1e", color: "#c8f564", fontFamily: "'Space Mono', monospace", fontSize: 10, padding: "3px 5px", borderRadius: 3, outline: "none" }}
              />
              <span style={{ fontSize: 9, color: "#444" }}>kg</span>
            </div>
            <div style={{ fontSize: 9, color: "#444", fontFamily: "'Space Mono', monospace" }}>Mode: healthy weight gain from {currentWeightKg}kg</div>
          </div>

          <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#333", marginBottom: 10, textTransform: "uppercase" }}>PHOTO TRACKING</div>
            {[["📸", "STEP 1", "#c8f564", "Add meal first (before photo)"], ["✏️", "STEP 2", "#60d0ff", "Edit later if not finished"], ["🍽️", "AFTER", "#60d0ff", "Upload leftovers photo"], ["📊", "LOG", "#c8f564", "Totals auto-recalculated"]].map(([icon, lbl, clr, desc], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>{icon}</span>
                <div>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: clr, marginRight: 4 }}>{lbl}</span>
                  <span style={{ fontSize: 9, color: "#444" }}>{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Chat & Log */}
        <div style={{ flex: "2 1 380px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a" }}>
            {[["chat", "💬 CHAT"], ["log", `📋 MEALS (${mealLog.length})`]].map(([t, lbl]) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: "transparent", border: "none", fontFamily: "'Space Mono', monospace",
                fontSize: 10, letterSpacing: 2, color: tab === t ? "#c8f564" : "#333",
                padding: "9px 16px", cursor: "pointer", textTransform: "uppercase",
                borderBottom: tab === t ? "2px solid #c8f564" : "2px solid transparent", marginBottom: -1
              }}>{lbl}</button>
            ))}
          </div>

          {tab === "chat" && (
            <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderTop: "none", borderRadius: "0 0 8px 8px", display: "flex", flexDirection: "column" }}>
              {/* Messages */}
              <div ref={chatRef} style={{ height: 320, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                    {(m.beforeUrl || m.afterUrl) && (
                      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        {m.beforeUrl && (
                          <div style={{ position: "relative" }}>
                            <img src={m.beforeUrl} alt="before" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, border: "2px solid #c8f564" }} />
                            <div style={{ position: "absolute", bottom: 2, left: 2, background: "#c8f564", color: "#080808", fontSize: 7, fontFamily: "'Space Mono', monospace", fontWeight: 700, padding: "1px 3px", borderRadius: 2 }}>BEFORE</div>
                          </div>
                        )}
                        {m.afterUrl && (
                          <div style={{ position: "relative" }}>
                            <img src={m.afterUrl} alt="after" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, border: "2px solid #60d0ff" }} />
                            <div style={{ position: "absolute", bottom: 2, left: 2, background: "#60d0ff", color: "#080808", fontSize: 7, fontFamily: "'Space Mono', monospace", fontWeight: 700, padding: "1px 3px", borderRadius: 2 }}>AFTER</div>
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{
                      maxWidth: "80%", background: m.role === "user" ? "#c8f564" : "#131313",
                      color: m.role === "user" ? "#080808" : "#d0d0d0",
                      border: m.role === "assistant" ? "1px solid #1e1e1e" : "none",
                      borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
                      padding: "9px 13px", fontSize: 12, lineHeight: 1.6,
                      fontFamily: m.role === "user" ? "'Space Mono', monospace" : "system-ui, sans-serif"
                    }}>{m.content}</div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: "flex" }}>
                    <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: "2px 12px 12px 12px", padding: "9px 14px" }}>
                      <span style={{ color: "#c8f564", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>analyzing meal</span>
                      <span style={{ animation: "blink 1s infinite", color: "#c8f564" }}>...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Photo Upload Row */}
              <div style={{ padding: "10px 14px 0 14px", display: "flex", gap: 8 }}>
                <DropZone label="BEFORE" color="#c8f564" preview={beforePreview} onChange={handleBeforeImg} onRemove={() => { setBeforeFile(null); setBeforePreview(null); }} />
                <DropZone label="AFTER" color="#60d0ff" preview={afterPreview} onChange={handleAfterImg} onRemove={() => { setAfterFile(null); setAfterPreview(null); }} />
                <div style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {!beforePreview && !afterPreview && (
                    <div style={{ fontSize: 9, color: "#2a2a2a", fontFamily: "'Space Mono', monospace", lineHeight: 1.9, textAlign: "center" }}>
                      tap to add photos<br />
                      <span style={{ color: "#c8f564" }}>before</span> / <span style={{ color: "#60d0ff" }}>after</span>
                    </div>
                  )}
                  {beforePreview && !afterPreview && <div style={{ fontSize: 9, color: "#444", fontFamily: "'Space Mono', monospace", textAlign: "center", lineHeight: 1.8 }}>👍 Got it<br />add AFTER or send now</div>}
                  {beforePreview && afterPreview && <div style={{ fontSize: 9, color: "#c8f564", fontFamily: "'Space Mono', monospace", textAlign: "center", lineHeight: 1.8 }}>✓ Both photos ready<br />hit LOG to analyze</div>}
                </div>
              </div>

              {/* Text + Send */}
              <div style={{ padding: "10px 14px 14px", display: "flex", gap: 8 }}>
                <input
                  value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                  placeholder={beforePreview ? "Add context... (optional)" : "Or type what you ate..."}
                  style={{ flex: 1, background: "#0a0a0a", border: "1px solid #1e1e1e", color: "#e0e0e0", fontFamily: "'Space Mono', monospace", fontSize: 11, padding: "9px 12px", borderRadius: 4, outline: "none" }}
                />
                <button onClick={sendMessage} disabled={!canSend} style={{
                  background: canSend ? "#c8f564" : "#111", color: canSend ? "#080808" : "#2a2a2a",
                  border: "none", borderRadius: 4, padding: "0 16px",
                  fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700,
                  cursor: canSend ? "pointer" : "default", transition: "all 0.2s", whiteSpace: "nowrap"
                }}>LOG →</button>
              </div>
            </div>
          )}

          {tab === "log" && (
            <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 14, height: 480, overflowY: "auto" }}>
              {editingMealId && (
                <div style={{ border: "1px solid #1e1e1e", borderRadius: 8, padding: 10, marginBottom: 12, background: "#0a0a0a" }}>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: "#60d0ff", marginBottom: 8 }}>EDIT MEAL · ADD AFTER PHOTO</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <DropZone
                      label="AFTER"
                      color="#60d0ff"
                      preview={editAfterPreview}
                      onChange={handleEditAfterImg}
                      onRemove={() => { setEditAfterFile(null); setEditAfterPreview(null); }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={saveAfterForMeal}
                      disabled={!editAfterFile || updatingMeal}
                      style={{
                        background: editAfterFile && !updatingMeal ? "#60d0ff" : "#111",
                        color: editAfterFile && !updatingMeal ? "#080808" : "#2a2a2a",
                        border: "none",
                        borderRadius: 4,
                        padding: "6px 10px",
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: editAfterFile && !updatingMeal ? "pointer" : "default"
                      }}
                    >
                      {updatingMeal ? "UPDATING..." : "SAVE AFTER →"}
                    </button>
                    <button
                      onClick={cancelMealEdit}
                      style={{
                        background: "transparent",
                        border: "1px solid #1e1e1e",
                        color: "#666",
                        borderRadius: 4,
                        padding: "6px 10px",
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 10,
                        cursor: "pointer"
                      }}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
              {mealLog.length === 0 ? (
                <div style={{ textAlign: "center", color: "#222", fontFamily: "'Space Mono', monospace", fontSize: 11, padding: "40px 0" }}>
                  NO MEALS LOGGED YET<br /><span style={{ fontSize: 9 }}>snap a meal or type what you ate</span>
                </div>
              ) : mealLog.map((entry) => <MealCard key={entry.id} entry={entry} onStartEdit={startEditingMeal} />)}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.2} }
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:#080808}
        ::-webkit-scrollbar-thumb{background:#1e1e1e;border-radius:2px}
        *{box-sizing:border-box}
      `}</style>
    </div>
  );
}
