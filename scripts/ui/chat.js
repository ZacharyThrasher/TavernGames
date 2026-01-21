import { playSound } from "../sounds.js";

export { playSound };

export async function createChatCard({ title, subtitle = "", message, icon = "fa-solid fa-dice-d20" }) {
  const content = `
    <div class="tavern-card">
      <header class="card-header">
        <i class="${icon}"></i>
        <div>
          <h3>${title}</h3>
          ${subtitle ? `<span class="subtitle">${subtitle}</span>` : ""}
        </div>
      </header>
      <div class="card-content">
        ${message}
      </div>
    </div>
  `;

  return ChatMessage.create({
    user: game.user.id,
    content,
    speaker: { alias: "Tavern Twenty-One" },
  });
}
