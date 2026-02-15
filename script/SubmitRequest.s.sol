// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DiligencePortal} from "../src/DiligencePortal.sol";

contract SubmitRequest is Script {
    function run() external returns (uint256 requestId) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address portalAddr = vm.envAddress("PORTAL_ADDRESS");

        address subject = vm.envAddress("SUBJECT");
        bytes32 docBundleHash = vm.envBytes32("DOC_BUNDLE_HASH");
        string memory metadataUri = vm.envString("METADATA_URI");

        vm.startBroadcast(key);
        requestId = DiligencePortal(portalAddr).submit(subject, docBundleHash, metadataUri);
        vm.stopBroadcast();

        console2.log("Portal:", portalAddr);
        console2.log("Subject:", subject);
        console2.logBytes32(docBundleHash);
        console2.log("MetadataURI:", metadataUri);
        console2.log("RequestId:", requestId);
    }
}

