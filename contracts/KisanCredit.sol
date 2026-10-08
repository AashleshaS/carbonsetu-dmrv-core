// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  KisanCredit — Green Earth Parcel Carbon Credit (GEPCC)
 * @notice Issues on-chain carbon credit tokens backed by Sentinel-2 NDVI data
 *         for verified farms in Nagpur district, Maharashtra.
 *
 * Architecture
 * ────────────
 * • Each token represents a unique farm parcel (1 parcel = 1 tokenId).
 * • All geo/NDVI/CO₂ metadata is stored on-chain inside a ParcelRecord struct.
 * • Minting links a Supabase farmer UUID to a permanent on-chain record.
 * • Burning permanently retires the credit (sets burned = true) — irreversible.
 * • 80 / 20 payout split is enforced off-chain (Supabase + Decentro UPI);
 *   this contract handles only the token lifecycle.
 *
 * Deployed: Polygon Amoy Testnet (chainId 80002)
 * Address:  0x049a443e7453F16C74229BF188B3A939e2753204
 *
 * ABI surface matches blockchain.ts in src/lib/blockchain.ts exactly.
 */
contract KisanCredit {

    // ── Data Structures ───────────────────────────────────────────────────────

    /**
     * @dev On-chain record for a single farm parcel.
     *      All numeric fields are stored as strings to preserve the exact
     *      decimal precision computed by the Python dMRV engine without
     *      requiring fixed-point arithmetic in Solidity.
     */
    struct ParcelRecord {
        string farmerId;   // Supabase UUID — links token ↔ off-chain DB record
        string gpsLat;     // Farm GPS latitude  (6 decimal places, WGS-84)
        string gpsLon;     // Farm GPS longitude (6 decimal places, WGS-84)
        string ndviScore;  // NDVI score from Sentinel-2 Band 8 / Band 4 ratio
        string co2Tonnes;  // Annual CO₂ sequestration in tonnes (NDVI × ha × 10)
        bool   burned;     // true once burnToken() is called — permanent retirement
    }

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice Owner address — only the owner can mint tokens.
    address public owner;

    /// @notice Monotonically increasing token counter.
    ///         After mintToken(), tokenCounter - 1 is the most recently minted tokenId.
    uint256 public tokenCounter;

    /// @notice Mapping from tokenId → ParcelRecord.
    mapping(uint256 => ParcelRecord) private _records;

    /// @notice Mapping from tokenId → token holder address (ERC-20-style ownership).
    mapping(uint256 => address) private _owners;

    /// @notice Mapping from tokenId → token unit balance minted.
    ///         Units = round(co2Tonnes * 10) for sub-tonne granularity.
    mapping(uint256 => uint256) private _amounts;

    // ── Events ────────────────────────────────────────────────────────────────

    /**
     * @dev Emitted when a new carbon credit token is minted.
     * @param tokenId   Unique on-chain identifier (uint256, auto-incremented).
     * @param farmerId  Supabase UUID of the farmer.
     * @param co2Tonnes CO₂ sequestration value (string).
     * @param ndviScore NDVI score (string).
     * @param gpsLat    Farm GPS latitude (string).
     * @param gpsLon    Farm GPS longitude (string).
     */
    event TokenMinted(
        uint256 indexed tokenId,
        string  farmerId,
        string  co2Tonnes,
        string  ndviScore,
        string  gpsLat,
        string  gpsLon
    );

    /**
     * @dev Emitted when a carbon credit token is permanently retired.
     * @param tokenId   Token that was burned.
     * @param farmerId  Supabase UUID of the farmer whose credit was retired.
     * @param co2Tonnes CO₂ value retired (string).
     */
    event TokenBurned(
        uint256 indexed tokenId,
        string  farmerId,
        string  co2Tonnes
    );

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "KisanCredit: caller is not the owner");
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        require(tokenId < tokenCounter, "KisanCredit: tokenId does not exist");
        _;
    }

    modifier notBurned(uint256 tokenId) {
        require(!_records[tokenId].burned, "KisanCredit: token already burned");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        tokenCounter = 0;
    }

    // ── Core Functions ────────────────────────────────────────────────────────

    /**
     * @notice Mint a new carbon credit token for a verified farm parcel.
     * @dev    Only the contract owner (admin wallet) can mint.
     *         Stores the full ParcelRecord on-chain and emits TokenMinted.
     *
     * @param to         Recipient address (farmer wallet or admin custody address).
     * @param farmerId   Supabase UUID string linking to the off-chain farmers table.
     * @param gpsLat     Farm GPS latitude as a string (e.g. "21.145623").
     * @param gpsLon     Farm GPS longitude as a string (e.g. "79.082341").
     * @param ndviScore  NDVI value as a string (e.g. "0.5789").
     * @param co2Tonnes  CO₂ sequestration as a string (e.g. "5.84").
     * @param amount     Token units to mint — typically round(co2Tonnes * 10).
     */
    function mintToken(
        address to,
        string  calldata farmerId,
        string  calldata gpsLat,
        string  calldata gpsLon,
        string  calldata ndviScore,
        string  calldata co2Tonnes,
        uint256 amount
    )
        public
        onlyOwner
    {
        require(to != address(0),   "KisanCredit: mint to zero address");
        require(amount > 0,         "KisanCredit: amount must be > 0");
        require(bytes(farmerId).length > 0, "KisanCredit: farmerId required");

        uint256 tokenId = tokenCounter;

        _records[tokenId] = ParcelRecord({
            farmerId:  farmerId,
            gpsLat:    gpsLat,
            gpsLon:    gpsLon,
            ndviScore: ndviScore,
            co2Tonnes: co2Tonnes,
            burned:    false
        });

        _owners[tokenId]  = to;
        _amounts[tokenId] = amount;

        tokenCounter += 1;

        emit TokenMinted(tokenId, farmerId, co2Tonnes, ndviScore, gpsLat, gpsLon);
    }

    /**
     * @notice Permanently retire (burn) a carbon credit token.
     * @dev    Sets ParcelRecord.burned = true — this is irreversible.
     *         Can be called by the token owner or the contract owner.
     *         Emits TokenBurned.
     *
     * @param tokenId  The token to retire.
     */
    function burnToken(uint256 tokenId)
        public
        tokenExists(tokenId)
        notBurned(tokenId)
    {
        require(
            msg.sender == _owners[tokenId] || msg.sender == owner,
            "KisanCredit: caller is not owner or token holder"
        );

        _records[tokenId].burned = true;

        emit TokenBurned(tokenId, _records[tokenId].farmerId, _records[tokenId].co2Tonnes);
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /**
     * @notice Return the full ParcelRecord for a given tokenId.
     * @dev    Matches the ABI in blockchain.ts:
     *         getTokenDetails(uint256) returns (tuple(string,string,string,string,string,bool))
     *
     * @param tokenId  Token to query.
     * @return record  The ParcelRecord struct (farmerId, gpsLat, gpsLon,
     *                 ndviScore, co2Tonnes, burned).
     */
    function getTokenDetails(uint256 tokenId)
        public
        view
        tokenExists(tokenId)
        returns (ParcelRecord memory record)
    {
        return _records[tokenId];
    }

    /**
     * @notice Return the holder address for a tokenId.
     * @param tokenId  Token to query.
     */
    function ownerOf(uint256 tokenId)
        public
        view
        tokenExists(tokenId)
        returns (address)
    {
        return _owners[tokenId];
    }

    /**
     * @notice Return the minted unit amount for a tokenId.
     * @param tokenId  Token to query.
     */
    function amountOf(uint256 tokenId)
        public
        view
        tokenExists(tokenId)
        returns (uint256)
    {
        return _amounts[tokenId];
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /**
     * @notice Transfer contract ownership to a new address.
     * @param newOwner  Must be non-zero.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "KisanCredit: new owner is zero address");
        owner = newOwner;
    }
}
