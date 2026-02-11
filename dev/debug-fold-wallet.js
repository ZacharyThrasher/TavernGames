
// Test Script for Fold Logic and NPC Wallet
// Run this in the Foundry console or as a macro

async function testFoldAndWallet() {
    const { getState, updateState } = game.modules.get("tavern-dice-master").api; // Assuming API access
    const moduleId = "tavern-dice-master";

    console.log("=== STARTING TAVERN DEBUG TEST ===");

    // 1. Check NPC Wallet Access
    const userId = game.user.id;
    const state = getState();
    const player = state.players?.[userId];
    const isNpc = player?.playingAsNpc;

    if (isNpc) {
        console.log("Playing as NPC:", player.npcName);
        const wallet = state.npcWallets?.[userId];
        console.log("NPC Wallet Balance:", wallet);

        // Simulate cost check
        const ante = game.settings.get(moduleId, "fixedAnte");
        const cost = ante; // Simulating d6/d8 cost

        console.log(`Checking affordability for ${cost}gp...`);
        if (wallet >= cost) {
            console.log("PASS: NPC can afford roll.");
        } else {
            console.error("FAIL: NPC cannot afford roll (or check failed).");
        }
    } else {
        console.log("Playing as PC. Skipping NPC wallet test.");
    }

    // 2. Check Fold Logic Simulation
    // We can't easily "click" the button from here without DOM, but we can call the socket action if exposed
    // However, we can check the state flags that *would* be used.

    const tableData = state.tableData;
    console.log("Current Phase:", tableData.phase);
    console.log("Current Player:", tableData.currentPlayer);
    console.log("My User ID:", userId);

    if (tableData.currentPlayer === userId) {
        console.log("It IS my turn.");

        // Check Fold Conditions
        const hasActed = tableData.hasActed?.[userId] ?? false;
        const alreadyFolded = tableData.folded?.[userId];

        console.log("Has Acted:", hasActed);
        console.log("Already Folded:", alreadyFolded);

        if (alreadyFolded) {
            console.warn("Player already folded.");
        } else {
            console.log("Player eligible to fold.");
            if (hasActed) {
                console.log("Result: Fold NO REFUND expected.");
            } else {
                console.log("Result: Fold WITH REFUND expected.");
            }
        }
    } else {
        console.log("It is NOT my turn. Fold should be disabled/blocked.");
    }

    console.log("=== END DEBUG TEST ===");
}

testFoldAndWallet();
