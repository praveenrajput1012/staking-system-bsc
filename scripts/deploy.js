const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying contracts to BSC Testnet...");

  // Deploy TestToken
  const Token = await ethers.getContractFactory("TestToken");
  const token = await Token.deploy(ethers.parseEther("1000000")); // 1 million tokens
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("✅ TestToken deployed at:", tokenAddress);

  // Deploy SimpleStaking with token address
  const Staking = await ethers.getContractFactory("SimpleStaking");
  const staking = await Staking.deploy(tokenAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("✅ SimpleStaking deployed at:", stakingAddress);

  // Optional: transfer some tokens to staking contract for ROI payouts
  const transferAmount = ethers.parseEther("500000");
  await token.transfer(stakingAddress, transferAmount);
  console.log(
    `💰 Sent ${ethers.formatEther(transferAmount)} tokens to staking contract`
  );

  console.log("\n🎉 Deployment completed successfully!");
  console.log("---------------------------------------");
  console.log("Token Address:   ", tokenAddress);
  console.log("Staking Address: ", stakingAddress);
  console.log("---------------------------------------");
  console.log("You can now interact via Remix or Hardhat console.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Deploy command->
// npx hardhat run scripts/deploy.js --network bsctestnet

// Verify Contracts command->
// npx hardhat verify --network bsctestnet DEPLOYED_ADDRESS "constructor_arg1" "constructor_arg2"
