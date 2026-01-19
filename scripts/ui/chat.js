export async function createChatCard({ title, message, img = "icons/dice/d20black.svg" }) {
  const content = `
    <div class="dnd5e chat-card tavern-card">
      <header class="card-header">
        <img src="${img}" />
        <h3>${title}</h3>
      </header>
      <div class="card-content">
        ${message}
      </div>
    </div>
  `;

  return ChatMessage.create({
    user: game.user.id,
    content,
  });
}
