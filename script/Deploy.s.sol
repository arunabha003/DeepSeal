// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DemoUSD} from "../src/DemoUSD.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {DiligencePortal} from "../src/DiligencePortal.sol";
import {RWAComplianceReceiver} from "../src/RWAComplianceReceiver.sol";
import {RWAVault} from "../src/RWAVault.sol";
import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/erc8004/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/erc8004/ValidationRegistry.sol";

contract Deploy is Script {
    struct DeployConfig {
        uint256 deployerKey;
        address deployer;
        uint256 agentRegistrarKey;
        address agentRegistrar;
        uint256 agentRegistrarFundingWei;
        address reportForwarder;
        bytes32 expectedWorkflowId;
        address expectedAuthor;
        bytes10 expectedWorkflowName;
        address easContract;
        bytes32 easSchemaUid;
        bool easRevocable;
        uint256 seedAmount;
        string reputationAgentUri;
        string validationAgentUri;
    }

    struct DeployArtifacts {
        DemoUSD asset;
        ComplianceRegistry registry;
        RWAComplianceReceiver receiver;
        RWAVault vault;
        DiligencePortal portal;
        IdentityRegistry identityRegistry;
        ReputationRegistry reputationRegistry;
        ValidationRegistry validationRegistry;
        uint256 reputationAgentId;
        uint256 validationAgentId;
    }

    function run() external {
        DeployConfig memory cfg = _readConfig();

        vm.startBroadcast(cfg.deployerKey);
        DeployArtifacts memory out = _deploy(cfg);
        vm.stopBroadcast();

        _print(cfg, out);
    }

    function _readConfig() internal returns (DeployConfig memory cfg) {
        cfg.deployerKey = vm.envUint("PRIVATE_KEY");
        cfg.deployer = vm.addr(cfg.deployerKey);
        cfg.agentRegistrarKey =
            vm.envOr("AGENT_REGISTRAR_PRIVATE_KEY", uint256(keccak256("RWA_AGENT_REGISTRAR_PRIVATE_KEY_V1")));
        cfg.agentRegistrar = vm.addr(cfg.agentRegistrarKey);
        cfg.agentRegistrarFundingWei = vm.envOr("AGENT_REGISTRAR_FUNDING_WEI", uint256(0.02 ether));
        cfg.reportForwarder = vm.envOr("CRE_REPORT_FORWARDER", address(0));
        cfg.expectedWorkflowId = vm.envOr("CRE_WORKFLOW_ID", bytes32(0));
        cfg.expectedAuthor = vm.envOr("CRE_WORKFLOW_AUTHOR", address(0));
        cfg.expectedWorkflowName = bytes10(vm.envOr("CRE_WORKFLOW_NAME", bytes32(0)));
        cfg.easContract = vm.envOr("EAS_ATTESTATION_CONTRACT", address(0));
        cfg.easSchemaUid = vm.envOr("EAS_SCHEMA_UID", bytes32(0));
        cfg.easRevocable = vm.envOr("EAS_REVOCABLE", true);
        cfg.seedAmount = vm.envOr("SEED_AMOUNT", uint256(1_000_000e6));
        cfg.reputationAgentUri = vm.envOr("REPUTATION_AGENT_URI", string("ipfs://agents/rwa-diligence-reputation"));
        cfg.validationAgentUri = vm.envOr("VALIDATION_AGENT_URI", string("ipfs://agents/rwa-diligence-validator"));
    }

    function _deploy(DeployConfig memory cfg) internal returns (DeployArtifacts memory out) {
        out.asset = new DemoUSD(cfg.deployer, "Demo USD", "dUSD", 6);
        out.registry = new ComplianceRegistry(cfg.deployer, cfg.deployer);
        out.receiver = new RWAComplianceReceiver(
            cfg.deployer,
            out.registry,
            cfg.reportForwarder,
            cfg.expectedWorkflowId,
            cfg.expectedAuthor,
            cfg.expectedWorkflowName
        );

        if (cfg.easContract != address(0) && cfg.easSchemaUid != bytes32(0)) {
            out.receiver.setEAS(cfg.easContract, cfg.easSchemaUid, cfg.easRevocable);
        }

        out.registry.setWorkflowOperator(address(out.receiver));
        out.vault = new RWAVault(out.asset, out.registry, "RWA Vault Share", "RWAV");
        out.portal = new DiligencePortal();

        out.identityRegistry = new IdentityRegistry();
        out.reputationRegistry = new ReputationRegistry();
        out.reputationRegistry.initialize(address(out.identityRegistry));
        out.validationRegistry = new ValidationRegistry();
        out.validationRegistry.initialize(address(out.identityRegistry));

        _registerERC8004Agents(cfg, out);
        out.receiver.setERC8004Reputation(address(out.reputationRegistry), out.reputationAgentId, 0);
        out.receiver.setERC8004Validation(address(out.validationRegistry), out.validationAgentId, address(out.receiver), true);

        out.asset.mint(cfg.deployer, cfg.seedAmount);
    }

    function _registerERC8004Agents(DeployConfig memory cfg, DeployArtifacts memory out) internal {
        require(cfg.agentRegistrar != address(0), "AGENT_REGISTRAR_ZERO");
        require(cfg.agentRegistrar.code.length == 0, "AGENT_REGISTRAR_MUST_BE_EOA");

        uint256 registrarBalance = cfg.agentRegistrar.balance;
        if (registrarBalance < cfg.agentRegistrarFundingWei) {
            (bool funded,) = payable(cfg.agentRegistrar).call{value: cfg.agentRegistrarFundingWei - registrarBalance}("");
            require(funded, "AGENT_REGISTRAR_FUNDING_FAILED");
        }

        vm.stopBroadcast();
        vm.startBroadcast(cfg.agentRegistrarKey);
        out.reputationAgentId = out.identityRegistry.register(cfg.reputationAgentUri);
        out.validationAgentId = out.identityRegistry.register(cfg.validationAgentUri);
        out.identityRegistry.approve(address(out.receiver), out.validationAgentId);
        vm.stopBroadcast();
        vm.startBroadcast(cfg.deployerKey);
    }

    function _print(DeployConfig memory cfg, DeployArtifacts memory out) internal {
        console2.log("Deployer:", cfg.deployer);
        console2.log("ERC8004 AgentRegistrar:", cfg.agentRegistrar);
        console2.log("CREReportForwarder:", cfg.reportForwarder);
        console2.logBytes32(cfg.expectedWorkflowId);
        console2.log("ExpectedAuthor:", cfg.expectedAuthor);
        console2.logBytes32(bytes32(cfg.expectedWorkflowName));
        console2.log("DemoUSD:", address(out.asset));
        console2.log("ComplianceRegistry:", address(out.registry));
        console2.log("RWAComplianceReceiver:", address(out.receiver));
        console2.log("RWAVault:", address(out.vault));
        console2.log("DiligencePortal:", address(out.portal));
        console2.log("ERC8004 IdentityRegistry:", address(out.identityRegistry));
        console2.log("ERC8004 ReputationRegistry:", address(out.reputationRegistry));
        console2.log("ERC8004 ValidationRegistry:", address(out.validationRegistry));
        console2.log("ERC8004 ReputationAgentId:", out.reputationAgentId);
        console2.log("ERC8004 ValidationAgentId:", out.validationAgentId);
        console2.log("EAS Attestation Contract:", cfg.easContract);
        console2.logBytes32(cfg.easSchemaUid);
    }
}
