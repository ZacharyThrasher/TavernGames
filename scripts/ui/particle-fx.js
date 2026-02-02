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

    /**
     * Spawns a short arcane burst (purple motes)
     * @param {HTMLElement} container
     * @param {number} amount
     */
    static spawnArcaneBurst(container, amount = 30) {
        if (!container) return;

        const count = Math.min(amount, 60);
        for (let i = 0; i < count; i++) {
            const mote = document.createElement("div");
            mote.classList.add("tavern-arcane");

            const startX = 40 + Math.random() * 20;
            const startY = 40 + Math.random() * 20;
            const driftX = (Math.random() - 0.5) * 60;
            const driftY = (Math.random() - 0.5) * 60;
            const delay = Math.random() * 0.2;
            const duration = 0.8 + Math.random() * 0.6;
            const scale = 0.6 + Math.random() * 0.6;

            mote.style.left = `${startX}%`;
            mote.style.top = `${startY}%`;
            mote.style.setProperty("--arcane-x", `${driftX}px`);
            mote.style.setProperty("--arcane-y", `${driftY}px`);
            mote.style.animationDelay = `${delay}s`;
            mote.style.animationDuration = `${duration}s`;
            mote.style.transform = `scale(${scale})`;

            container.appendChild(mote);

            setTimeout(() => {
                mote.remove();
            }, (duration + delay) * 1000);
        }
    }

    /**
     * Spawns an ale splash (amber droplets)
     * @param {HTMLElement} container
     * @param {number} amount
     */
    static spawnAleSplash(container, amount = 24) {
        if (!container) return;

        const count = Math.min(amount, 60);
        for (let i = 0; i < count; i++) {
            const drop = document.createElement("div");
            drop.classList.add("tavern-ale");

            const startX = 45 + Math.random() * 10;
            const startY = 45 + Math.random() * 10;
            const driftX = (Math.random() - 0.5) * 120;
            const driftY = (Math.random() - 0.7) * 120;
            const delay = Math.random() * 0.15;
            const duration = 0.6 + Math.random() * 0.6;
            const scale = 0.5 + Math.random() * 0.8;

            drop.style.left = `${startX}%`;
            drop.style.top = `${startY}%`;
            drop.style.setProperty("--ale-x", `${driftX}px`);
            drop.style.setProperty("--ale-y", `${driftY}px`);
            drop.style.animationDelay = `${delay}s`;
            drop.style.animationDuration = `${duration}s`;
            drop.style.transform = `scale(${scale})`;

            container.appendChild(drop);

            setTimeout(() => {
                drop.remove();
            }, (duration + delay) * 1000);
        }
    }

    /**
     * Spawns a short spark burst (for click/impact feedback)
     * @param {HTMLElement} container
     * @param {number} amount
     * @param {string} theme - gold | ember | arcane | blood | mint
     */
    static spawnSparkBurst(container, amount = 14, theme = "gold") {
        if (!container) return;

        const count = Math.min(amount, 30);
        for (let i = 0; i < count; i++) {
            const spark = document.createElement("div");
            spark.classList.add("tavern-spark", theme);

            const angle = Math.random() * Math.PI * 2;
            const distance = 18 + Math.random() * 42;
            const driftX = Math.cos(angle) * distance;
            const driftY = Math.sin(angle) * distance;
            const delay = Math.random() * 0.08;
            const duration = 0.4 + Math.random() * 0.35;
            const scale = 0.6 + Math.random() * 0.9;
            const rotation = Math.floor(Math.random() * 360);

            spark.style.setProperty("--spark-x", `${driftX}px`);
            spark.style.setProperty("--spark-y", `${driftY}px`);
            spark.style.setProperty("--spark-rot", `${rotation}deg`);
            spark.style.setProperty("--spark-scale", `${scale}`);
            spark.style.animationDelay = `${delay}s`;
            spark.style.animationDuration = `${duration}s`;

            container.appendChild(spark);

            setTimeout(() => {
                spark.remove();
            }, (duration + delay) * 1000);
        }
    }
}
