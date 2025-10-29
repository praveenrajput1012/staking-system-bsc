const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleStaking", function () {
  let Token, token, Staking, staking;
  let owner, user1, user2, referrer, others;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const STAKE_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, user1, user2, referrer, ...others] = await ethers.getSigners();

    // Deploy mock token
    Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy(INITIAL_SUPPLY);
    await token.waitForDeployment();

    // Deploy staking contract
    Staking = await ethers.getContractFactory("SimpleStaking");
    staking = await Staking.deploy(await token.getAddress());
    await staking.waitForDeployment();

    // Transfer tokens to users
    await token.transfer(user1.address, STAKE_AMOUNT * 2n);
    await token.transfer(user2.address, STAKE_AMOUNT * 2n);
    await token.transfer(referrer.address, STAKE_AMOUNT * 2n);

    // Approve staking contract
    await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT * 2n);
    await token.connect(user2).approve(await staking.getAddress(), STAKE_AMOUNT * 2n);
    await token.connect(referrer).approve(await staking.getAddress(), STAKE_AMOUNT * 2n);
  });

  describe("Deployment", function () {
    it("should set the correct owner and staking token", async function () {
      expect(await staking.owner()).to.equal(owner.address);
      expect(await staking.stakingToken()).to.equal(await token.getAddress());
    });
  });

  describe("Staking", function () {
    it("should allow user to stake tokens", async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT, ethers.ZeroAddress);
      const s = await staking.stakes(user1.address);
      expect(s.amount).to.equal(STAKE_AMOUNT);
    });

    it("should assign referrer only first time and send bonus", async function () {
      const refBalanceBefore = await token.balanceOf(referrer.address);
      await staking.connect(user1).stake(STAKE_AMOUNT, referrer.address);
      const refBalanceAfter = await token.balanceOf(referrer.address);

      // 0.5% of 1000 = 5
      expect(refBalanceAfter - refBalanceBefore).to.equal(ethers.parseEther("5"));

      const refInContract = await staking.referrer(user1.address);
      expect(refInContract).to.equal(referrer.address);

      // second time referrer shouldn’t change
      await staking.connect(user1).stake(STAKE_AMOUNT, user2.address);
      const refCheck = await staking.referrer(user1.address);
      expect(refCheck).to.equal(referrer.address);
    });

    it("should revert if staking amount is zero", async function () {
      await expect(staking.connect(user1).stake(0, referrer.address)).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Claim ROI", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT, ethers.ZeroAddress);
    });

    it("should not allow claim before 24h", async function () {
      await expect(staking.connect(user1).claimROI()).to.be.revertedWith("Claim available once per 24h");
    });

    it("should allow claim after 24h and pay 1% reward", async function () {
      const ONE_DAY = 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [ONE_DAY]);
      await ethers.provider.send("evm_mine");

      const beforeBal = await token.balanceOf(user1.address);
      await staking.connect(user1).claimROI();
      const afterBal = await token.balanceOf(user1.address);

      // ROI = 1% of 1000 = 10
      expect(afterBal - beforeBal).to.equal(ethers.parseEther("10"));

      const stakeInfo = await staking.stakes(user1.address);
      expect(stakeInfo.lastClaim).to.be.greaterThan(0);
    });

    it("should revert if no stake", async function () {
      await expect(staking.connect(user2).claimROI()).to.be.revertedWith("No stake");
    });
  });

  describe("Unstake", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT, ethers.ZeroAddress);
    });

    it("should allow user to unstake partial amount", async function () {
      const unstakeAmount = ethers.parseEther("500");
      await staking.connect(user1).unstake(unstakeAmount);

      const s = await staking.stakes(user1.address);
      expect(s.amount).to.equal(ethers.parseEther("500"));
    });

    it("should revert if unstake > stake", async function () {
      await expect(staking.connect(user1).unstake(ethers.parseEther("2000"))).to.be.revertedWith("Invalid amount");
    });

    it("should revert if unstake 0", async function () {
      await expect(staking.connect(user1).unstake(0)).to.be.revertedWith("Invalid amount");
    });
  });

  describe("getPendingROI()", function () {
    it("should return 0 if no stake or too early", async function () {
      const res1 = await staking.getPendingROI(user1.address);
      expect(res1).to.equal(0);

      await staking.connect(user1).stake(STAKE_AMOUNT, ethers.ZeroAddress);
      const res2 = await staking.getPendingROI(user1.address);
      expect(res2).to.equal(0);
    });

    it("should return correct ROI after 24h", async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT, ethers.ZeroAddress);
      const ONE_DAY = 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [ONE_DAY]);
      await ethers.provider.send("evm_mine");

      const res = await staking.getPendingROI(user1.address);
      expect(res).to.equal(ethers.parseEther("10"));
    });
  });

  describe("Owner functions", function () {
    it("should allow owner to withdraw any token", async function () {
      const balBefore = await token.balanceOf(owner.address);
      const withdrawAmount = ethers.parseEther("10");

      // Send some tokens to staking contract manually
      await token.transfer(await staking.getAddress(), withdrawAmount);

      await staking.connect(owner).withdrawTokens(await token.getAddress(), withdrawAmount);

      const balAfter = await token.balanceOf(owner.address);
      expect(balAfter - balBefore).to.equal(withdrawAmount);
    });

    it("should revert if non-owner tries withdraw", async function () {
      await expect(
        staking.connect(user1).withdrawTokens(await token.getAddress(), ethers.parseEther("1"))
      ).to.be.revertedWith("Not owner");
    });
  });
});
