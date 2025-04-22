(function() {
    'use strict';

    // --- Configuration ---
    const TARGET_HOSTNAME = 'task-manager.biz';
    const TARGET_PATH_PREFIX = '/partner/';
    const INITIAL_DELAY_MS = 2500; // Delay after DOM ready before first run
    const UPDATE_DELAY_MS = 1500;   // Short delay after link click before re-running extraction
    const RETRY_ACCOUNT_NAME_ENABLED = true; // Set to false to disable retries
    const MAX_ACCOUNT_NAME_RETRIES = 30;     // Number of retry attempts
    const ACCOUNT_NAME_RETRY_DELAY_MS = 600; // Delay between retries

    // LocalStorage Keys for Position
    const MODAL_POSITION_TOP_KEY = 'tmPartnerModalPosTop';
    const MODAL_POSITION_LEFT_KEY = 'tmPartnerModalPosLeft';

    // URL Templates
    const WSP_URL_TEMPLATE = 'https://www.websiteprodashboard.com/vdc-session/transfer/{PARTNER_ID}/{AGID}/?123';
    const PC_URL_TEMPLATE = 'https://partners.vendasta.com/businesses/accounts/{AGID}/details?marketId=default&_pid={PARTNER_ID}/?123';

    // URL Patterns for Extraction
    const URL_PATTERNS = [
        { regex: /\/partner\/[^/]+\/accounts\/([^/]+)\/task\/[^/]+\/([^/]+)/, agidIndex: 1, taskIdIndex: 2, partnerIdParam: 'purchasingPartnerId', patternType: 'accounts_task' },
        { regex: /\/partner\/[^/]+\/projects\/([^/]+)\/([^/]+)/, agidIndex: 1, taskIdIndex: 2, partnerIdParam: 'purchasingPartnerId', patternType: 'projects' },
        { regex: /\/partner\/[^/]+\/reseller-accounts\/([^/]+)/, agidIndex: 1, taskIdIndex: null, partnerIdParam: 'purchasingPartnerId', patternType: 'reseller' }
    ];

    // DOM Selectors
    const ACCOUNT_NAME_TITLE_SELECTOR = 'a.account-name-title'; // Primary for Name + Supplement Href
    const ACCOUNT_NAME_FALLBACK_SELECTORS = [ 'div.company-name', 'h2.header--title', 'div.title span.task-title', 'a.task-company-name' ]; // Name Fallbacks
    const H2_ACCOUNT_NAME_PREFIX = ' Business profile for ';
    const PRIORITY_LINK_SELECTOR = 'div.title-section a'; // Link for priority href check on /projects/ pages AND task-list ID check

    // Modal IDs
    const MODAL_ID = 'tm-info-extractor-modal-partner';
    const MODAL_STYLE_ID = 'tm-info-extractor-style-partner';
    const TASK_PROJECT_LABEL_ID = 'tm-label-task-project';
    const TASK_PROJECT_VALUE_ID = 'tm-value-task-id';
    const ACCOUNT_NAME_VALUE_ID = 'tm-value-account-name';
    const AGID_VALUE_ID = 'tm-value-agid';
    const PARTNER_ID_VALUE_ID = 'tm-value-partner-id';
    const WSP_BUTTON_ID = 'tm-button-wsp';
    const PC_BUTTON_ID = 'tm-button-pc';

    // --- State ---
    let updateTimeoutId = null;
    let accountNameRetryTimeoutId = null;
    let accountNameRetryCount = 0;
    let modalElementCache = null;
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    // --- Initial HTML Structure ---
    const MODAL_HTML = `<div id="${MODAL_ID}"><div class="tm-info-row"><span class="tm-label">Account:</span><span class="tm-value" id="${ACCOUNT_NAME_VALUE_ID}" title="N/A">N/A</span><button class="tm-copy-button" data-copy-target-id="${ACCOUNT_NAME_VALUE_ID}" title="Copy 'N/A'" disabled>Copy</button></div><div class="tm-info-row"><span class="tm-label">AGID:</span><span class="tm-value" id="${AGID_VALUE_ID}" title="N/A">N/A</span><button class="tm-copy-button" data-copy-target-id="${AGID_VALUE_ID}" title="Copy 'N/A'" disabled>Copy</button></div><div class="tm-info-row"><span class="tm-label">Partner ID:</span><span class="tm-value" id="${PARTNER_ID_VALUE_ID}" title="N/A">N/A</span><button class="tm-copy-button" data-copy-target-id="${PARTNER_ID_VALUE_ID}" title="Copy 'N/A'" disabled>Copy</button></div><div class="tm-info-row"><span class="tm-label" id="${TASK_PROJECT_LABEL_ID}">Task ID:</span><span class="tm-value" id="${TASK_PROJECT_VALUE_ID}" title="N/A">N/A</span><button class="tm-copy-button" data-copy-target-id="${TASK_PROJECT_VALUE_ID}" title="Copy 'N/A'" disabled>Copy</button></div><div class="tm-info-row tm-button-row"><div class="tm-button-row-container"><button id="${WSP_BUTTON_ID}" class="tm-external-link-button" title="Open WSP Dashboard (Requires AGID)" disabled>Website Pro</button><button id="${PC_BUTTON_ID}" class="tm-external-link-button" title="Open Partner Center (Requires AGID & Partner ID)" disabled>Partner Center</button></div></div></div>`;

    // --- CSS Styling ---
    const MODAL_CSS = `#${MODAL_ID}{height: fit-content;} #${MODAL_ID} .tm-info-row button {pointer-events:all!important;}#${MODAL_ID} .tm-info-row {pointer-events:none;}#${MODAL_ID}{position:fixed;bottom:20px;left:20px;background-color:rgba(0,0,0,.7);color:#fff;padding:15px;border-radius:5px;z-index:10001;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Fira Sans","Droid Sans","Helvetica Neue",sans-serif;font-size:13px;max-width:350px;box-shadow:0 4px 12px rgba(0,0,0,.5);line-height:1.5;opacity:.95;transition:opacity .2s ease-in-out, bottom 0s, left 0s, top 0s; /* Disable transition for position */ cursor: move; user-select: none;}#${MODAL_ID}:hover{opacity:1}#${MODAL_ID} .tm-info-row{margin-bottom:8px;display:flex;align-items:center;gap:8px}#${MODAL_ID} .tm-info-row:last-child{margin-bottom:0}#${MODAL_ID} .tm-button-row{margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.15);}#${MODAL_ID} .tm-button-row-container{display:flex;justify-content:space-between;gap:10px;width:100%;}#${MODAL_ID} .tm-label{font-weight:600;flex-shrink:0;opacity:.85;width:90px;text-align:right; cursor: default; user-select: text;}#${MODAL_ID} .tm-value{word-break:break-all;margin-right:5px;min-width:0;flex-grow:1;background-color:rgba(255,255,255,.1);padding:2px 4px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; cursor: text; user-select: text;}#${MODAL_ID} .tm-copy-button, #${MODAL_ID} .tm-external-link-button{cursor:pointer;border:none;background-color:#5a5a5a;color:#e0e0e0;font-size:10px;padding:4px 8px;border-radius:3px;flex-shrink:0;vertical-align:middle;transition:background-color .15s ease,transform .1s ease;line-height:1; text-align: center; user-select: none;}#${MODAL_ID} .tm-copy-button { margin-left: auto; }#${MODAL_ID} .tm-external-link-button { flex-grow: 1; }#${MODAL_ID} .tm-copy-button:hover:not(:disabled), #${MODAL_ID} .tm-external-link-button:hover:not(:disabled){background-color:#777;transform:scale(1.05)}#${MODAL_ID} .tm-copy-button:active:not(:disabled), #${MODAL_ID} .tm-external-link-button:active:not(:disabled){transform:scale(.98)}#${MODAL_ID} .tm-copy-button:disabled, #${MODAL_ID} .tm-external-link-button:disabled{cursor:not-allowed;opacity:.5}#${MODAL_ID} .tm-copy-button.success{background-color:#28a745!important;color:#fff}#${MODAL_ID} .tm-copy-button.error{background-color:#dc3545!important;color:#fff}`;

    // --- Helper Functions ---
    function ensureStylesInjected() { if (!document.getElementById(MODAL_STYLE_ID)) { const styleSheet = document.createElement("style"); styleSheet.id = MODAL_STYLE_ID; styleSheet.textContent = MODAL_CSS; document.head.appendChild(styleSheet); console.log("Partner Info Extractor: Styles injected."); } }

    function ensureModalExists() {
        if (!modalElementCache) { modalElementCache = document.getElementById(MODAL_ID); }
        if (!modalElementCache) {
            ensureStylesInjected();
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = MODAL_HTML.trim();
            const createdElement = modalContainer.firstChild;
            if (createdElement) {
                // Attach ALL listeners when creating
                createdElement.querySelectorAll('.tm-copy-button').forEach(button => button.addEventListener('click', handleCopyClick));
                createdElement.querySelector(`#${WSP_BUTTON_ID}`)?.addEventListener('click', handleExternalLinkClick);
                createdElement.querySelector(`#${PC_BUTTON_ID}`)?.addEventListener('click', handleExternalLinkClick);
                createdElement.addEventListener('mousedown', handleMouseDown); // Drag start
                createdElement.addEventListener('contextmenu', handleContextMenu); // Position reset
                document.body.appendChild(createdElement);
                modalElementCache = createdElement; // Cache the newly created element
                console.log("Partner Info Extractor: Modal injected.");
                return true;
            }
            console.error("Partner Info Extractor: Failed to create modal element.");
            return false;
        }
        return true; // Modal exists (was in cache or found)
    }

    function extractDataFromUrl(urlString) {
        let data = { agid: 'N/A', taskId: 'N/A', partnerId: 'N/A', matchedPatternType: null };
        if (!urlString) return data;
        try {
            const url = new URL(urlString, window.location.origin);
            const pathname = url.pathname; const searchParams = url.searchParams;
            for (const pattern of URL_PATTERNS) {
                const match = pathname.match(pattern.regex);
                if (match) {
                    data.matchedPatternType = pattern.patternType;
                    data.agid = match[pattern.agidIndex] ?? 'N/A';
                    data.taskId = (pattern.taskIdIndex && match[pattern.taskIdIndex]) ? match[pattern.taskIdIndex] : 'N/A';
                    data.partnerId = searchParams.get(pattern.partnerIdParam) ?? 'N/A';
                    break;
                }
            }
            if (data.partnerId === 'N/A') data.partnerId = searchParams.get('purchasingPartnerId') ?? 'N/A';
        } catch (e) { console.error("Partner Info Extractor: Error parsing URL:", urlString, e); }
        return data;
    }

    function updateModalRow(valueId, newValue) {
        if (!modalElementCache && !ensureModalExists()) return;
        const valueSpan = modalElementCache.querySelector(`#${valueId}`);
        const copyButton = modalElementCache.querySelector(`button[data-copy-target-id="${valueId}"]`);
        const displayValue = newValue || 'N/A';
        if (valueSpan) { valueSpan.textContent = displayValue; valueSpan.setAttribute('title', displayValue); }
        if (copyButton) {
            const actualValue = displayValue !== 'N/A' ? displayValue : '';
            const isDisabled = !actualValue;
            copyButton.disabled = isDisabled;
            copyButton.dataset.copyValue = actualValue;
            copyButton.setAttribute('title', isDisabled ? "Nothing to copy" : `Copy "${actualValue}"`);
            const currentClasses = copyButton.classList;
            const currentText = copyButton.textContent;
            if (currentClasses.contains('success') || currentClasses.contains('error')) { currentClasses.remove('success', 'error'); if (currentText !== 'Copy') copyButton.textContent = 'Copy'; }
            else if (isDisabled && currentText !== 'Copy') { copyButton.textContent = 'Copy'; }
            else if (!isDisabled && currentText !== 'Copy') { copyButton.textContent = 'Copy'; }
        }
    }

    function handleCopyClick(event) {
        event.stopPropagation();
        const button = event.target;
        const valueToCopy = button.dataset.copyValue;
        if (!valueToCopy) return;
        const originalText = 'Copy';
        navigator.clipboard.writeText(valueToCopy).then(() => {
            button.textContent = 'Copied!'; button.classList.add('success'); button.classList.remove('error'); button.disabled = true;
            setTimeout(() => { const currentVal = button.dataset.copyValue; if (currentVal) { button.textContent = originalText; button.classList.remove('success'); button.disabled = false; } else { button.textContent = originalText; button.classList.remove('success'); } }, 1500);
        }).catch(err => {
            console.error('Failed to copy: ', err); button.textContent = 'Error'; button.classList.add('error'); button.classList.remove('success'); button.disabled = true;
            setTimeout(() => { const currentVal = button.dataset.copyValue; if (currentVal) { button.textContent = originalText; button.classList.remove('error'); button.disabled = false; } else { button.textContent = originalText; button.classList.remove('error'); } }, 2000);
        });
    }

    function cancelAccountNameRetry() { if (accountNameRetryTimeoutId) { clearTimeout(accountNameRetryTimeoutId); accountNameRetryTimeoutId = null; accountNameRetryCount = 0; } }

    function extractAccountNameStandard() {
        const primaryElement = document.querySelector(ACCOUNT_NAME_TITLE_SELECTOR);
        let name = primaryElement?.textContent?.trim();
        if (name) return name;
        for (const selector of ACCOUNT_NAME_FALLBACK_SELECTORS) {
            const fallbackElement = document.querySelector(selector);
            let fallbackName = fallbackElement?.textContent?.trim();
            if (fallbackName) {
                if (selector === 'h2.header--title' && fallbackName.startsWith(H2_ACCOUNT_NAME_PREFIX)) fallbackName = fallbackName.substring(H2_ACCOUNT_NAME_PREFIX.length).trim();
                if (fallbackName) return fallbackName;
            }
        }
        return 'N/A';
    }

    function tryAgainAccountName() {
        accountNameRetryTimeoutId = null;
        if (!modalElementCache) return;
        const currentName = modalElementCache.querySelector(`#${ACCOUNT_NAME_VALUE_ID}`)?.textContent ?? 'N/A';
        if (currentName === 'N/A' && accountNameRetryCount < MAX_ACCOUNT_NAME_RETRIES) {
            accountNameRetryCount++;
            const newName = extractAccountNameStandard();
            if (newName !== 'N/A') {
                console.log("Partner Info Extractor: Found Account Name on retry!");
                updateModalRow(ACCOUNT_NAME_VALUE_ID, newName);
                accountNameRetryCount = 0;
            } else {
                accountNameRetryTimeoutId = setTimeout(tryAgainAccountName, ACCOUNT_NAME_RETRY_DELAY_MS);
            }
        } else {
            if (accountNameRetryCount >= MAX_ACCOUNT_NAME_RETRIES) console.log("Partner Info Extractor: Max Account Name retries reached.");
            accountNameRetryCount = 0;
        }
    }

    function scheduleUpdate() { if (updateTimeoutId) clearTimeout(updateTimeoutId); cancelAccountNameRetry(); updateTimeoutId = setTimeout(runExtractionAndUpdate, UPDATE_DELAY_MS); }

    function initialize() {
        if (window.location.hostname !== TARGET_HOSTNAME || !window.location.pathname.startsWith(TARGET_PATH_PREFIX)) {
            const existingModal = document.getElementById(MODAL_ID); if (existingModal) existingModal.remove();
            const existingStyle = document.getElementById(MODAL_STYLE_ID); if (existingStyle) existingStyle.remove();
            modalElementCache = null; return;
        }
        console.log("Partner Info Extractor: Initializing on", window.location.href);
        if (ensureModalExists()) { // Ensure modal exists and cache is set
            // Restore position from localStorage
            try {
                const savedTop = localStorage.getItem(MODAL_POSITION_TOP_KEY);
                const savedLeft = localStorage.getItem(MODAL_POSITION_LEFT_KEY);
                if (savedTop && savedLeft && modalElementCache) { // Check cache again for safety
                    console.log("Partner Info Extractor: Restoring modal position.");
                    modalElementCache.style.top = savedTop;
                    modalElementCache.style.left = savedLeft;
                    modalElementCache.style.bottom = ''; // Clear default bottom positioning
                }
            } catch (e) { console.error("Partner Info Extractor: Error restoring position:", e); }

            runExtractionAndUpdate(); // Run first data extraction
            document.addEventListener('click', handleGlobalClick, true); // Add general click listener
            console.log("Partner Info Extractor: Initialization complete. Listening.");
        }
    }

    function resetModalToNA() {
        // console.log("Resetting modal values to N/A."); // Less verbose
        const valueIds = [ACCOUNT_NAME_VALUE_ID, AGID_VALUE_ID, PARTNER_ID_VALUE_ID, TASK_PROJECT_VALUE_ID];
        valueIds.forEach(id => updateModalRow(id, 'N/A'));
        const label = modalElementCache?.querySelector(`#${TASK_PROJECT_LABEL_ID}`);
        if (label && label.textContent !== 'Task ID:') label.textContent = 'Task ID:';
        const wspButton = modalElementCache?.querySelector(`#${WSP_BUTTON_ID}`);
        const pcButton = modalElementCache?.querySelector(`#${PC_BUTTON_ID}`);
        if (wspButton) { wspButton.disabled = true; wspButton.setAttribute('title', 'Open WSP Dashboard (Requires AGID)'); wspButton.removeAttribute('data-link-href'); }
        if (pcButton) { pcButton.disabled = true; pcButton.setAttribute('title', 'Open Partner Center (Requires AGID & Partner ID)'); pcButton.removeAttribute('data-link-href'); }
    }

    function handleExternalLinkClick(event) {
        event.stopPropagation();
        const button = event.target;
        if (button.disabled) return;
        const url = button.dataset.linkHref;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else console.error("Missing URL on button:", button.id);
    }

    function handleGlobalClick(event) {
        const clickedElement = event.target;
        if (clickedElement.closest(`#${MODAL_ID}`)) return; // Ignore clicks inside modal
        const isActionable = clickedElement.closest('a, button');
        if (isActionable) {
            resetModalToNA();
            scheduleUpdate();
        }
    }

    function updateExternalLinkButtons(agid, partnerId) {
        if (!modalElementCache) return;
        const wspButton = modalElementCache.querySelector(`#${WSP_BUTTON_ID}`);
        const pcButton = modalElementCache.querySelector(`#${PC_BUTTON_ID}`);
        const hasAgid = agid && agid !== 'N/A';
        const hasPartnerId = partnerId && partnerId !== 'N/A';
        if (wspButton) { if (hasAgid) { const wspUrl = WSP_URL_TEMPLATE.replace('{AGID}', encodeURIComponent(agid)); wspButton.disabled = false; wspButton.setAttribute('title', `Open WSP Dashboard for ${agid}`); wspButton.dataset.linkHref = wspUrl; } else { wspButton.disabled = true; wspButton.setAttribute('title', 'Open WSP Dashboard (Requires AGID)'); wspButton.removeAttribute('data-link-href'); } }
        if (pcButton) { if (hasAgid && hasPartnerId) { let pcUrl = PC_URL_TEMPLATE.replace('{AGID}', encodeURIComponent(agid)); pcUrl = pcUrl.replace('{PARTNER_ID}', encodeURIComponent(partnerId)); pcButton.disabled = false; pcButton.setAttribute('title', `Open Partner Center for ${agid} (PID: ${partnerId})`); pcButton.dataset.linkHref = pcUrl; } else { pcButton.disabled = true; let title = 'Open Partner Center'; if (!hasAgid && !hasPartnerId) title += ' (Requires AGID & Partner ID)'; else if (!hasAgid) title += ' (Requires AGID)'; else title += ' (Requires Partner ID)'; pcButton.setAttribute('title', title); pcButton.removeAttribute('data-link-href'); } }
    }

    // --- Dragging and Reset Functions ---
    function handleMouseDown(event) { if (event.button === 1 && event.target === modalElementCache) { event.preventDefault(); isDragging = true; offsetX = event.clientX - modalElementCache.offsetLeft; offsetY = event.clientY - modalElementCache.offsetTop; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); if(modalElementCache) modalElementCache.style.opacity = '0.85'; } }
    function handleMouseMove(event) { if (!isDragging || !modalElementCache) return; let newLeft = event.clientX - offsetX; let newTop = event.clientY - offsetY; const modalRect = modalElementCache.getBoundingClientRect(); const vpWidth = window.innerWidth; const vpHeight = window.innerHeight; if (newLeft < 0) newLeft = 0; if (newTop < 0) newTop = 0; if (newLeft + modalRect.width > vpWidth) newLeft = vpWidth - modalRect.width; if (newTop + modalRect.height > vpHeight) newTop = vpHeight - modalRect.height; modalElementCache.style.left = newLeft + 'px'; modalElementCache.style.top = newTop + 'px'; modalElementCache.style.bottom = ''; }
    function handleMouseUp(event) { if (event.button === 1 && isDragging) { isDragging = false; window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); if (modalElementCache) { modalElementCache.style.opacity = ''; try { localStorage.setItem(MODAL_POSITION_TOP_KEY, modalElementCache.style.top); localStorage.setItem(MODAL_POSITION_LEFT_KEY, modalElementCache.style.left); console.log("Partner Info Extractor: Saved modal position."); } catch (e) { console.error("Error saving modal position:", e); } } } }
    function handleContextMenu(event) { if (event.target === modalElementCache) { event.preventDefault(); console.log("Partner Info Extractor: Resetting modal position."); modalElementCache.style.top = ''; modalElementCache.style.left = ''; modalElementCache.style.bottom = ''; try { localStorage.removeItem(MODAL_POSITION_TOP_KEY); localStorage.removeItem(MODAL_POSITION_LEFT_KEY); console.log("Partner Info Extractor: Cleared saved modal position."); } catch (e) { console.error("Error clearing modal position:", e); } } }

    // --- Main Extraction Logic ---
    function runExtractionAndUpdate() {
        cancelAccountNameRetry();
        if (!ensureModalExists()) return;

        const currentPath = window.location.pathname;
        const currentPageUrl = window.location.href;
        const accountTitleLink = document.querySelector(ACCOUNT_NAME_TITLE_SELECTOR);
        const priorityLinkElement = document.querySelector(PRIORITY_LINK_SELECTOR);

        let finalUrlData = { agid: 'N/A', taskId: 'N/A', partnerId: 'N/A', matchedPatternType: null };
        let finalAccountName = 'N/A';
        let finalLabelText = 'Task ID:'; // Default label

        // Task List Page Logic
        if (currentPath.includes('/tasks/task-list')) {
            finalAccountName = accountTitleLink?.textContent?.trim() ?? 'N/A';
            finalUrlData = extractDataFromUrl(priorityLinkElement?.href);
            finalLabelText = 'Task ID:'; // Explicitly Task ID for this page
            // console.log("Using task-list logic.");
        }
        // Standard Page Logic
        else {
            // console.log("Using standard logic.");
            let urlDataSource = null;
            let usePriorityLinkDataSource = false;
            const mainPageUrlData = extractDataFromUrl(currentPageUrl);
            const mainPagePatternType = mainPageUrlData.matchedPatternType;

            if (mainPagePatternType === 'projects' && priorityLinkElement?.href) {
                const priorityHrefData = extractDataFromUrl(priorityLinkElement.href);
                if (priorityHrefData.agid !== 'N/A') {
                    urlDataSource = priorityHrefData;
                    usePriorityLinkDataSource = true;
                    // console.log("Prioritizing data from priority link href.");
                }
            }

            if (!urlDataSource) { urlDataSource = mainPageUrlData; }
            finalUrlData = urlDataSource; // Assign the determined source
            finalAccountName = extractAccountNameStandard(); // Extract name

            // Supplement missing data from account title link href
            const accountTitleHref = accountTitleLink?.href;
            if (accountTitleHref && (finalUrlData.agid === 'N/A' || finalUrlData.taskId === 'N/A' || finalUrlData.partnerId === 'N/A')) {
                const linkUrlData = extractDataFromUrl(accountTitleHref);
                if (finalUrlData.agid === 'N/A' && linkUrlData.agid !== 'N/A') finalUrlData.agid = linkUrlData.agid;
                if (finalUrlData.taskId === 'N/A' && linkUrlData.taskId !== 'N/A') finalUrlData.taskId = linkUrlData.taskId;
                if (finalUrlData.partnerId === 'N/A' && linkUrlData.partnerId !== 'N/A') finalUrlData.partnerId = linkUrlData.partnerId;
            }

            // Determine final label text based on conditions
            finalLabelText = (mainPagePatternType === 'projects' && !usePriorityLinkDataSource) ? 'Project ID:' : 'Task ID:';
        }

        // Update Modal Data Rows
        updateModalRow(ACCOUNT_NAME_VALUE_ID, finalAccountName);
        updateModalRow(AGID_VALUE_ID, finalUrlData.agid);
        updateModalRow(PARTNER_ID_VALUE_ID, finalUrlData.partnerId);
        updateModalRow(TASK_PROJECT_VALUE_ID, finalUrlData.taskId);

        // Update Label (check prevents unnecessary DOM write)
        const taskProjectLabel = modalElementCache?.querySelector(`#${TASK_PROJECT_LABEL_ID}`);
        if (taskProjectLabel && taskProjectLabel.textContent !== finalLabelText) {
             taskProjectLabel.textContent = finalLabelText;
        }

        // Update External Buttons
        updateExternalLinkButtons(finalUrlData.agid, finalUrlData.partnerId);

        // console.log("Update complete."); // Less verbose

        // Handle Account Name Retry (Standard Pages Only)
        if (!currentPath.includes('/tasks/task-list') && RETRY_ACCOUNT_NAME_ENABLED && finalAccountName === 'N/A' && !accountNameRetryTimeoutId) {
            console.log("Partner Info Extractor: Account Name not found, scheduling retries...");
            accountNameRetryCount = 0;
            accountNameRetryTimeoutId = setTimeout(tryAgainAccountName, ACCOUNT_NAME_RETRY_DELAY_MS);
        }
    }

    // --- Run ---
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { setTimeout(initialize, INITIAL_DELAY_MS); }); }
    else { setTimeout(initialize, INITIAL_DELAY_MS); }

})();