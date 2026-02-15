async function run() {
  console.log("No default Firebase seed configured. Add seed logic in scripts/seed-firebase.js.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
