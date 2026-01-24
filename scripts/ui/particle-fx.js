/**
 * Simple Particle System for Tavern Games
 * Handles Falling Coins (CSS Animation driven)
 */
export class ParticleFactory {

    /**
     * Spawns a shower of gold coins
     * @param {HTMLElement} container - Container to append particles to
     * @param {number} amount - Number of coins to spawn (approx)
     */
    static spawnCoinShower(container, amount = 50) {
        if (!container) return;

        // Limit particle count for performance
        const count = Math.min(amount, 100);

        for (let i = 0; i < count; i++) {
            const coin = document.createElement("div");
            coin.classList.add("tavern-coin");

            // Random properties
            const startX = Math.random() * 100; // 0-100% width
            const delay = Math.random() * 2; // 0-2s delay
            const duration = 1 + Math.random() * 2; // 1-3s fall duration
            const scale = 0.5 + Math.random() * 0.8; // Random size

            coin.style.left = `${startX}%`;
            coin.style.animationDelay = `${delay}s`;
            coin.style.animationDuration = `${duration}s`;
            coin.style.transform = `scale(${scale})`;

            // Coin Content (FontAwesome Icon)
            coin.innerHTML = '<i class="fa-solid fa-coins"></i>';

            container.appendChild(coin);

            // Cleanup after animation
            setTimeout(() => {
                coin.remove();
            }, (duration + delay) * 1000);
        }
    }
}
