// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SimpleStaking {
    using SafeERC20 for IERC20;

    IERC20 public stakingToken;
    address public owner;

    uint256 public constant ROI_PERCENT = 100; // 1% = 100 / 10000
    uint256 public constant REF_PERCENT = 50; // 0.5% = 50 / 10000
    uint256 public constant PERCENT_DIVISOR = 10000;
    uint256 public constant CLAIM_INTERVAL = 1 days;

    struct StakeInfo {
        uint256 amount;
        uint256 lastClaim;
    }

    mapping(address => StakeInfo) public stakes;
    mapping(address => address) public referrer;
    mapping(address => bool) public hasReferred;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(IERC20 _stakingToken) {
        stakingToken = _stakingToken;
        owner = msg.sender;
    }

    function stake(uint256 _amount, address _referrer) external {
        require(_amount > 0, "Amount must be > 0");

        // Assign referrer only first time
        if (
            !hasReferred[msg.sender] &&
            _referrer != msg.sender &&
            _referrer != address(0)
        ) {
            referrer[msg.sender] = _referrer;
            hasReferred[msg.sender] = true;
        }

        // Transfer staking tokens
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Pay referral instantly
        address ref = referrer[msg.sender];
        if (ref != address(0)) {
            uint256 refBonus = (_amount * REF_PERCENT) / PERCENT_DIVISOR;
            stakingToken.safeTransfer(ref, refBonus);
        }

        // Update user stake
        StakeInfo storage s = stakes[msg.sender];
        s.amount += _amount;

        // Initialize last claim time if first deposit
        if (s.lastClaim == 0) {
            s.lastClaim = block.timestamp;
        }
    }

    function claimROI() external {
        StakeInfo storage s = stakes[msg.sender];
        require(s.amount > 0, "No stake");
        require(
            block.timestamp >= s.lastClaim + CLAIM_INTERVAL,
            "Claim available once per 24h"
        );

        uint256 reward = (s.amount * ROI_PERCENT) / PERCENT_DIVISOR;

        s.lastClaim = block.timestamp;

        stakingToken.safeTransfer(msg.sender, reward);
    }

    function unstake(uint256 _amount) external {
        StakeInfo storage s = stakes[msg.sender];
        require(_amount > 0 && _amount <= s.amount, "Invalid amount");

        s.amount -= _amount;
        stakingToken.safeTransfer(msg.sender, _amount);
    }

    function getPendingROI(address _user) external view returns (uint256) {
        StakeInfo memory s = stakes[_user];
        if (s.amount == 0 || block.timestamp < s.lastClaim + CLAIM_INTERVAL) {
            return 0;
        }
        return (s.amount * ROI_PERCENT) / PERCENT_DIVISOR;
    }

    function withdrawTokens(
        address _token,
        uint256 _amount
    ) external onlyOwner {
        IERC20(_token).safeTransfer(owner, _amount);
    }
}
