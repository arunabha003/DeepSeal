// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

import {ComplianceRegistry} from "./ComplianceRegistry.sol";

contract RWAVault is ERC4626 {
    ComplianceRegistry public immutable complianceRegistry;

    error NotCompliant(address subject);

    constructor(IERC20 asset_, ComplianceRegistry complianceRegistry_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC4626(asset_)
    {
        complianceRegistry = complianceRegistry_;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _requireCompliant(caller);
        _requireCompliant(receiver);
        super._deposit(caller, receiver, assets, shares);
    }

    function _isCompliant(address subject) internal view returns (bool) {
        return complianceRegistry.isApproved(subject);
    }

    function _requireCompliant(address subject) internal view {
        if (!_isCompliant(subject)) revert NotCompliant(subject);
    }
}
