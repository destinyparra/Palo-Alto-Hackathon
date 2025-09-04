// Configuration
const API_BASE_URL = window.location.origin; // Flask 
const USER_ID = 'default_user';

// State management
let entries = [];
let reflections = [];
let currentSection = 'journal';
let entriesSkip = 0;
let entriesLimit = 20;
let hasMoreEntries = true;
let reflectionsSkip = 0;
let reflectionsLimit = 20;
let hasMoreReflections = true;
let currentReflectionEntry = null; // Track current entry for reflection
let currentReflectionPrompt = null; // Track current prompt

// Track expanded state for entries by _id
let expandedEntries = {};

// Theme data for visualization
const themeData = {
    'work': { emoji: '🌳', name: 'Oak Tree', color: 'from-green-400 to-green-600' },
    'family': { emoji: '🌹', name: 'Rose Bush', color: 'from-pink-400 to-pink-600' },
    'health': { emoji: '🪷', name: 'Lotus', color: 'from-blue-400 to-blue-600' },
    'love': { emoji: '🌸', name: 'Cherry Blossom', color: 'from-pink-300 to-pink-500' },
    'friends': { emoji: '🌻', name: 'Sunflower', color: 'from-yellow-400 to-yellow-600' },
    'stress': { emoji: '🎋', name: 'Bamboo', color: 'from-green-300 to-green-500' },
    'happiness': { emoji: '🌼', name: 'Daffodil', color: 'from-yellow-300 to-yellow-500' },
    'creativity': { emoji: '🌺', name: 'Wildflowers', color: 'from-purple-300 to-pink-400' },
    'learning': { emoji: '🌿', name: 'Fern', color: 'from-green-300 to-green-400' },
    'travel': { emoji: '🌴', name: 'Palm Tree', color: 'from-green-400 to-teal-500' }
};

// Template Helper Functions
function getTemplate(templateId) {
    const template = document.getElementById(templateId);
    return template.content.cloneNode(true);
}

function createThemeBadge(theme) {
    const template = getTemplate('theme-badge-template');
    const themeInfo = themeData[theme] || { emoji: '🌱', name: theme };

    template.querySelector('.theme-emoji').textContent = themeInfo.emoji;
    template.querySelector('.theme-name').textContent = theme;

    return template;
}

function createToast(message, type = 'info') {
    const template = getTemplate('toast-template');
    const toast = template.querySelector('div');

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

    // Add border classes individually
    toast.classList.add('border-l-4');
    if (type === 'success') {
        toast.classList.add('border-green-400');
    } else if (type === 'error') {
        toast.classList.add('border-red-400');
    } else {
        toast.classList.add('border-blue-400');
    }

    template.querySelector('.toast-icon').textContent = icon;
    template.querySelector('.toast-message').textContent = message;

    return template;
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Request failed:', error);
        showToast(`Error: ${error.message}`, 'error');
        throw error;
    }
}

// Navigation
function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionName).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    currentSection = sectionName;

    // Load data for the section if needed
    switch (sectionName) {
        case 'garden':
            fetchGarden();
            break;
        case 'insights':
            fetchInsights();
            break;
        case 'reflect':
            fetchReflection();
            break;
        case 'reflections':
            fetchReflections();
            break;
    }
}

// Prompt functionality
async function getNewPrompt() {
    try {
        const data = await apiRequest('/api/prompt');
        document.getElementById('current-prompt').textContent = data.prompt;
    } catch (error) {
        console.error('Failed to fetch prompt:', error);
    }
}

// Get new reflection prompt
async function getNewReflectionPrompt() {
    if (!currentReflectionEntry) return;
    try {
        const response = await apiRequest(`/api/reflect?entryId=${currentReflectionEntry._id}`);
        if (response.success) {
            currentReflectionPrompt = response.prompt;
            updateReflectionUI();
        }
    } catch (error) {
        console.error('Failed to fetch new reflection prompt:', error);
    }
}

// Get different entry to reflect on
async function getDifferentEntry() {
    try {
        const excludeIds = currentReflectionEntry ? [currentReflectionEntry._id] : [];
        const response = await apiRequest(`/api/reflect?userId=${USER_ID}&exclude=${excludeIds.join(',')}`);

        if (response.success) {
            currentReflectionEntry = response.entry;
            currentReflectionPrompt = response.prompt;
            updateReflectionUI();
        }
    } catch (error) {
        console.error('Failed to fetch different entry:', error);
    }
}

// Entry management
async function addEntry(event) {
    event.preventDefault();
    const text = document.getElementById('entry-text').value.trim();
    const submitBtn = document.getElementById('submit-btn');

    if (!text) return;

    // Disable form while submitting
    submitBtn.innerHTML = '<div class="spinner mr-2"></div>Planting...';
    submitBtn.disabled = true;

    try {
        const response = await apiRequest('/api/entries', {
            method: 'POST',
            body: JSON.stringify({
                text: text,
                userId: USER_ID
            })
        });

        if (response.success) {
            document.getElementById('entry-text').value = '';
            entriesSkip = 0; // Reset pagination
            await fetchEntries(); // Reload entries
            showToast('🌱 Entry added successfully! Your garden is growing!', 'success');
        } else {
            throw new Error(response.error || 'Failed to create entry');
        }
    } catch (error) {
        showToast(`Failed to add entry: ${error.message}`, 'error');
    } finally {
        submitBtn.innerHTML = '🌱 Plant Your Thoughts';
        submitBtn.disabled = false;
    }
}

async function fetchEntries(append = false) {
    try {
        const response = await apiRequest(
            `/api/entries?userId=${USER_ID}&limit=${entriesLimit}&skip=${append ? entriesSkip : 0}`
        );

        if (response.success) {
            if (append) {
                entries = [...entries, ...response.entries];
                entriesSkip += entriesLimit;
            } else {
                entries = response.entries;
                entriesSkip = entriesLimit;
            }

            hasMoreEntries = response.hasMore;
            updateEntriesList();

            // Update load more button
            const loadMoreBtn = document.getElementById('load-more-btn');
            loadMoreBtn.style.display = hasMoreEntries ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Failed to fetch entries:', error);
    }
}

async function loadMoreEntries() {
    if (hasMoreEntries) {
        await fetchEntries(true);
    }
}

function updateEntriesList() {
    const container = document.getElementById('entries-list');

    if (entries.length === 0) {
        const emptyTemplate = getTemplate('empty-entries-template');
        container.innerHTML = '';
        container.appendChild(emptyTemplate);
        return;
    }

    // Clear container
    container.innerHTML = '';

    entries.forEach(entry => {
        const template = getTemplate('entry-card-template');
        const card = template.querySelector('.entry-card');

        // Set up basic data
        const date = new Date(entry.createdAt);
        const sentimentEmoji = entry.sentiment > 0.1 ? '😊' : entry.sentiment < -0.1 ? '😔' : '😐';
        const isReflection = entry.isReflection;
        const expanded = expandedEntries[entry._id];

        // Populate date
        const dateSpan = template.querySelector('.entry-date');
        dateSpan.textContent = `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        // Show reflection badge if needed
        if (isReflection) {
            card.classList.add('border-l-4', 'border-purple-400');
            template.querySelector('.reflection-badge').classList.remove('hidden');
        }

        // Set sentiment
        template.querySelector('.sentiment-emoji').textContent = sentimentEmoji;
        if (entry.confidence) {
            template.querySelector('.confidence-score').textContent = `${Math.round(entry.confidence * 100)}%`;
        }

        // Set entry text
        const entryText = template.querySelector('.entry-text');
        if (expanded) {
            entryText.textContent = entry.text;

            // Handle original entry for reflections
            if (isReflection && entry.originalEntryId) {
                const originalContainer = template.querySelector('.original-entry-container');
                originalContainer.innerHTML = `<div class="bg-white/10 rounded-xl p-4 mb-2 text-sm text-gray-700" id="original-entry-${entry._id}">Loading original entry...</div>`;
            }
        } else {
            entryText.textContent = entry.summary || entry.text.substring(0, 150) + '...';
        }

        // Add themes
        if (entry.themes && entry.themes.length > 0) {
            const themesContainer = template.querySelector('.themes-container');
            entry.themes.forEach(theme => {
                const themeBadge = createThemeBadge(theme);
                themesContainer.appendChild(themeBadge);
            });
        }

        // Add metadata
        if (entry.wordCount) {
            const metadata = template.querySelector('.entry-metadata');
            metadata.textContent = `${entry.wordCount} words • ${entry.emotion || 'neutral'} emotion`;
        }

        // Set up click handler
        card.setAttribute('data-entry-id', entry._id);
        card.addEventListener('click', async function (e) {
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
            const entryId = card.getAttribute('data-entry-id');
            expandedEntries[entryId] = !expandedEntries[entryId];
            updateEntriesList();

            // Handle original entry loading for reflections
            if (expandedEntries[entryId] && entry && entry.isReflection && entry.originalEntryId) {
                const originalDiv = document.getElementById(`original-entry-${entryId}`);
                if (originalDiv) {
                    try {
                        const resp = await apiRequest(`/api/entries?userId=${USER_ID}&entryId=${entry.originalEntryId}`);
                        if (resp.success && resp.entries && resp.entries.length > 0) {
                            const orig = resp.entries[0];
                            originalDiv.innerHTML = `<div class='mb-1 text-xs text-gray-500'>Reflecting on:</div><div class='italic text-gray-800'>"${orig.text}"</div>`;
                        } else {
                            originalDiv.innerHTML = '<span class="text-red-500">Original entry not found.</span>';
                        }
                    } catch (err) {
                        originalDiv.innerHTML = '<span class="text-red-500">Error loading original entry.</span>';
                    }
                }
            }
        });

        container.appendChild(template);
    });
}

// Reflections functionality
async function fetchReflections(append = false) {
    try {
        const response = await apiRequest(
            `/api/reflections?userId=${USER_ID}&limit=${reflectionsLimit}&skip=${append ? reflectionsSkip : 0}`
        );

        if (response.success) {
            if (append) {
                reflections = [...reflections, ...response.reflections];
                reflectionsSkip += reflectionsLimit;
            } else {
                reflections = response.reflections;
                reflectionsSkip = reflectionsLimit;
            }

            hasMoreReflections = response.hasMore;
            updateReflectionsList();
        }
    } catch (error) {
        console.error('Failed to fetch reflections:', error);
    }
}

function updateReflectionsList() {
    const container = document.getElementById('reflections-content');

    if (reflections.length === 0) {
        const emptyTemplate = getTemplate('empty-reflections-template');
        container.innerHTML = '';
        container.appendChild(emptyTemplate);
        return;
    }

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-8';

    reflections.forEach(reflection => {
        const template = getTemplate('reflection-card-template');
        const date = new Date(reflection.createdAt);
        const originalDate = reflection.originalEntry ? new Date(reflection.originalEntry.createdAt) : null;

        // Set dates
        template.querySelector('.reflection-date').textContent = `Reflection from ${date.toLocaleDateString()}`;
        if (originalDate) {
            template.querySelector('.original-date').textContent = `Reflecting on entry from ${originalDate.toLocaleDateString()}`;
        }

        // Set sentiment
        const sentimentEmoji = reflection.sentiment > 0.1 ? '😊' : reflection.sentiment < -0.1 ? '😔' : '😐';
        template.querySelector('.reflection-sentiment').textContent = sentimentEmoji;

        // Set original entry if exists
        if (reflection.originalEntry) {
            const originalSection = template.querySelector('.original-entry-section');
            originalSection.classList.remove('hidden');
            const originalText = reflection.originalEntry.text.length > 150 ?
                reflection.originalEntry.text.substring(0, 150) + '...' :
                reflection.originalEntry.text;
            template.querySelector('.original-entry-text').textContent = `"${originalText}"`;
        }

        // Set reflection text
        template.querySelector('.reflection-text').textContent = reflection.text;

        // Add themes
        if (reflection.themes && reflection.themes.length > 0) {
            const themesContainer = template.querySelector('.reflection-themes');
            reflection.themes.forEach(theme => {
                const span = document.createElement('span');
                span.className = 'bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium';
                span.innerHTML = `${themeData[theme]?.emoji || '🌱'} ${theme}`;
                themesContainer.appendChild(span);
            });
        }

        wrapper.appendChild(template);
    });

    // Add load more button if needed
    if (hasMoreReflections) {
        const loadMoreDiv = document.createElement('div');
        loadMoreDiv.className = 'text-center pt-8';
        loadMoreDiv.innerHTML = '<button onclick="loadMoreReflections()" class="text-white/70 hover:text-white underline font-medium">Load more reflections</button>';
        wrapper.appendChild(loadMoreDiv);
    }

    container.appendChild(wrapper);
}

async function loadMoreReflections() {
    if (hasMoreReflections) {
        await fetchReflections(true);
    }
}

async function fetchGarden() {
    try {
        const response = await apiRequest(`/api/garden?userId=${USER_ID}`);

        if (response.success) {
            updateGarden(response.garden);
            updateGardenStats(response);
        }
    } catch (error) {
        console.error('Failed to fetch garden:', error);
    }
}

function updateGarden(gardenData) {
    const container = document.getElementById('garden-grid');

    if (!gardenData || gardenData.length === 0) {
        const emptyTemplate = getTemplate('empty-garden-template');
        container.innerHTML = '';
        container.appendChild(emptyTemplate);
        return;
    }

    container.innerHTML = '';

    gardenData.forEach(plant => {
        const template = getTemplate('plant-card-template');
        const themeInfo = themeData[plant.theme] || { emoji: '🌱', name: 'Plant', color: 'from-green-400 to-green-600' };
        const progress = plant.stage === 'blooming' ? 100 :
            plant.stage === 'growing' ? 75 :
                plant.stage === 'sprouting' ? 40 : 15;

        // Set background gradient
        const bg = template.querySelector('.plant-bg');
        bg.className = `plant-bg absolute inset-0 opacity-10 bg-gradient-to-br ${themeInfo.color}`;

        // Set emoji and sparkle for blooming
        template.querySelector('.plant-emoji').textContent = themeInfo.emoji;
        if (plant.stage === 'blooming') {
            template.querySelector('.sparkle-indicator').classList.remove('hidden');
        }

        // Set plant info
        template.querySelector('.plant-name').textContent = themeInfo.name || plant.theme.charAt(0).toUpperCase() + plant.theme.slice(1);
        template.querySelector('.plant-theme').textContent = `${plant.theme} theme`;
        template.querySelector('.plant-stage').textContent = plant.stage;
        template.querySelector('.plant-count').textContent = `${plant.count} entries`;

        // Set progress bar
        const progressBar = template.querySelector('.plant-progress');
        progressBar.className = `plant-progress h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${themeInfo.color}`;
        progressBar.style.width = `${progress}%`;

        // Set badge
        template.querySelector('.plant-badge').textContent = plant.theme.charAt(0).toUpperCase() + plant.theme.slice(1);

        // Set next stage info
        if (plant.nextStageNeeds && plant.nextStageNeeds > 0) {
            const nextStage = template.querySelector('.plant-next-stage');
            nextStage.classList.remove('hidden');
            nextStage.textContent = `${plant.nextStageNeeds} more entries to reach next stage! 🌸`;
        }

        container.appendChild(template);
    });
}

function updateGardenStats(response) {
    const statsContainer = document.getElementById('garden-stats');
    const statsGrid = document.getElementById('garden-stats-grid');

    if (response.totalPlants > 0) {
        statsContainer.classList.remove('hidden');

        const sproutingPlants = response.garden.filter(p => p.stage === 'sprouting').length;
        const growingPlants = response.garden.filter(p => p.stage === 'growing').length;
        const seedlingPlants = response.garden.filter(p => p.stage === 'seedling').length;
        const totalWaterings = response.garden.reduce((sum, p) => sum + p.count, 0);

        statsGrid.innerHTML = '';

        const stats = [
            { emoji: '🌳', value: response.bloomingPlants, label: 'Blooming Plants' },
            { emoji: '🌿', value: growingPlants, label: 'Growing Plants' },
            { emoji: '🌱', value: sproutingPlants + seedlingPlants, label: 'Young Plants' },
            { emoji: '💧', value: totalWaterings, label: 'Total Waterings' }
        ];

        stats.forEach(stat => {
            const template = getTemplate('garden-stat-template');
            template.querySelector('.stat-emoji').textContent = stat.emoji;
            template.querySelector('.stat-value').textContent = stat.value;
            template.querySelector('.stat-label').textContent = stat.label;
            statsGrid.appendChild(template);
        });
    }
}

async function fetchInsights() {
    try {
        const response = await apiRequest(`/api/insights?userId=${USER_ID}&period=weekly`);

        if (response.success) {
            updateInsights(response);
        }
    } catch (error) {
        console.error('Failed to fetch insights:', error);
    }
}

function updateInsights(data) {
    const container = document.getElementById('insights-content');

    if (data.entryCount === 0) {
        const emptyTemplate = getTemplate('empty-insights-template');
        container.innerHTML = '';
        container.appendChild(emptyTemplate);
        return;
    }

    const sentimentEmoji = data.avgSentiment > 0.3 ? '🌞' :
        data.avgSentiment > 0.1 ? '☀️' :
            data.avgSentiment > -0.1 ? '⛅' :
                data.avgSentiment > -0.3 ? '🌧️' : '⛈️';

    const sentimentColor = data.avgSentiment > 0.1 ? 'text-green-400' :
        data.avgSentiment < -0.1 ? 'text-red-400' : 'text-yellow-400';

    const sentimentDescription = data.avgSentiment > 0.3 ? 'Very Positive' :
        data.avgSentiment > 0.1 ? 'Positive' :
            data.avgSentiment > -0.1 ? 'Neutral' :
                data.avgSentiment > -0.3 ? 'Negative' : 'Very Negative';

    // Build insights HTML dynamically
    const sentimentSection = createSentimentSection(sentimentEmoji, sentimentDescription, sentimentColor, data.avgSentiment);
    const themesSection = createThemesSection(data.topThemes, data.themeCounts);
    const advancedSection = data.insights ? createAdvancedInsightsSection(data.insights) : '';
    const summarySection = createSummarySection(data);

    container.innerHTML = sentimentSection + themesSection + advancedSection + summarySection;
}

function createSentimentSection(emoji, description, color, sentiment) {
    return `
        <div class="grid lg:grid-cols-3 gap-8 mb-12">
            <div class="glass rounded-3xl shadow-2xl p-8 card-hover">
                <div class="text-center">
                    <span class="text-6xl mb-6 block float">${emoji}</span>
                    <h3 class="text-2xl font-bold text-white mb-4">Emotional Weather</h3>
                    <p class="text-3xl font-bold mb-4 ${color}">
                        ${description}
                    </p>
                    <div class="w-full bg-white/20 rounded-full h-3 mb-4">
                        <div class="bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 h-3 rounded-full relative">
                            <div class="absolute bg-white border-2 border-gray-400 rounded-full w-5 h-5 -top-1 transform -translate-x-2.5" 
                                 style="left: ${((sentiment + 1) * 50)}%;">
                            </div>
                        </div>
                    </div>
                    <p class="text-sm text-white/70">Score: ${sentiment.toFixed(3)}</p>
                </div>
            </div>`;
}

function createThemesSection(topThemes, themeCounts) {
    let themesHtml = '';
    if (topThemes && topThemes.length > 0) {
        themesHtml = topThemes.map(theme => {
            const maxCount = Math.max(...Object.values(themeCounts));
            const percentage = (themeCounts[theme] / maxCount * 100);
            return `
                <div class="flex items-center justify-between p-4 bg-white/10 rounded-2xl">
                    <div class="flex items-center space-x-4">
                        <span class="text-3xl">${themeData[theme]?.emoji || '🌱'}</span>
                        <div>
                            <h4 class="font-semibold text-white capitalize">${theme}</h4>
                            <p class="text-sm text-white/70">${themeData[theme]?.name || 'Plant'}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        <div class="w-32 bg-white/20 rounded-full h-2">
                            <div class="bg-gradient-to-r ${themeData[theme]?.color || 'from-green-400 to-green-600'} h-2 rounded-full transition-all duration-1000" 
                                 style="width: ${percentage}%"></div>
                        </div>
                        <span class="text-sm font-medium text-white">${themeCounts[theme]}</span>
                    </div>
                </div>`;
        }).join('');
    } else {
        themesHtml = `
            <div class="text-center py-8">
                <span class="text-6xl mb-4 block float">🌱</span>
                <p class="text-white/70">No themes detected yet</p>
            </div>`;
    }

    return `
            <div class="lg:col-span-2 glass rounded-3xl shadow-2xl p-8 card-hover">
                <div class="flex items-center mb-6">
                    <span class="text-3xl mr-3 float">🌿</span>
                    <h3 class="text-2xl font-bold text-white">Themes in Focus</h3>
                </div>
                <div class="space-y-4">
                    ${themesHtml}
                </div>
            </div>
        </div>`;
}

function createAdvancedInsightsSection(insights) {
    return `
        <div class="glass rounded-3xl p-8 shadow-xl mb-12">
            <div class="text-center mb-8">
                <span class="text-4xl mb-4 block float">🧠</span>
                <h3 class="text-2xl font-bold text-white mb-2">Advanced Insights</h3>
                <p class="text-white/70">Deeper patterns in your writing</p>
            </div>
            
            <div class="grid md:grid-cols-3 gap-6">
                <div class="text-center p-6 bg-white/10 rounded-2xl">
                    <span class="text-4xl mb-3 block float">📝</span>
                    <h4 class="font-bold text-2xl text-white">${insights.avgWordCount || 0}</h4>
                    <p class="text-white/70 text-sm">Avg Words/Entry</p>
                </div>
                
                <div class="text-center p-6 bg-white/10 rounded-2xl">
                    <span class="text-4xl mb-3 block float">📈</span>
                    <h4 class="font-bold text-2xl text-white capitalize">${insights.sentimentTrend || 'stable'}</h4>
                    <p class="text-white/70 text-sm">Mood Trend</p>
                </div>
                
                <div class="text-center p-6 bg-white/10 rounded-2xl">
                    <span class="text-4xl mb-3 block float">⏰</span>
                    <h4 class="font-bold text-2xl text-white">${insights.mostActiveHour ? insights.mostActiveHour + ':00' : 'N/A'}</h4>
                    <p class="text-white/70 text-sm">Most Active Hour</p>
                </div>
            </div>
        </div>`;
}

function createSummarySection(data) {
    return `
        <div class="glass rounded-3xl p-8 shadow-xl">
            <div class="text-center">
                <span class="text-4xl mb-4 block float">📈</span>
                <h3 class="text-2xl font-bold text-white mb-6">Journey Summary</h3>
                <div class="grid md:grid-cols-3 gap-6">
                    <div class="text-center p-6 bg-white/10 rounded-2xl">
                        <span class="text-4xl mb-3 block float">✍️</span>
                        <h4 class="font-bold text-3xl text-white">${data.entryCount}</h4>
                        <p class="text-white/70 text-sm">Entries This Week</p>
                    </div>
                    <div class="text-center p-6 bg-white/10 rounded-2xl">
                        <span class="text-4xl mb-3 block float">🎭</span>
                        <h4 class="font-bold text-3xl text-white">${data.topThemes ? data.topThemes.length : 0}</h4>
                        <p class="text-white/70 text-sm">Active Themes</p>
                    </div>
                    <div class="text-center p-6 bg-white/10 rounded-2xl">
                        <span class="text-4xl mb-3 block float">💫</span>
                        <h4 class="font-bold text-3xl text-white">${Math.round(((data.avgSentiment + 1) / 2) * 100)}%</h4>
                        <p class="text-white/70 text-sm">Positivity Score</p>
                    </div>
                </div>
            </div>
        </div>`;
}

async function fetchReflection() {
    try {
        const excludeIds = currentReflectionEntry ? [currentReflectionEntry._id] : [];
        const response = await apiRequest(`/api/reflect?userId=${USER_ID}&exclude=${excludeIds.join(',')}`);

        if (response.success) {
            currentReflectionEntry = response.entry;
            currentReflectionPrompt = response.prompt;
            updateReflectionUI();
        }
    } catch (error) {
        console.error('Failed to fetch reflection:', error);
    }
}

function updateReflectionUI() {
    const container = document.getElementById('reflect-content');

    if (!currentReflectionEntry) {
        const emptyTemplate = getTemplate('no-reflection-entry-template');
        container.innerHTML = '';
        container.appendChild(emptyTemplate);
        return;
    }

    const entry = currentReflectionEntry;
    const date = new Date(entry.createdAt);
    const prompt = currentReflectionPrompt;

    // Build reflection UI dynamically
    container.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <!-- Past Entry Card -->
            <div class="glass rounded-3xl shadow-2xl p-10 card-hover mb-8">
                <div class="flex items-center justify-between mb-6">
                    <div class="flex items-center space-x-3">
                        <span class="text-4xl float">📜</span>
                        <h3 class="text-2xl font-bold text-white">Memory from ${date.toLocaleDateString()}</h3>
                    </div>
                    <div class="flex items-center space-x-2 bg-white/20 rounded-full px-4 py-2">
                        <span class="text-2xl">
                            ${entry.sentiment > 0.1 ? '😊' : entry.sentiment < -0.1 ? '😔' : '😐'}
                        </span>
                        ${entry.emotion ? `<span class="text-xs text-white/70">${entry.emotion}</span>` : ''}
                    </div>
                </div>
                <blockquote class="text-xl text-white/90 italic leading-relaxed mb-6 pl-6 border-l-4 border-white/40">
                    "${entry.text}"
                </blockquote>
                ${entry.themes && entry.themes.length > 0 ? `
                    <div class="flex flex-wrap gap-2">
                        ${entry.themes.map(theme => `
                            <span class="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                                ${themeData[theme]?.emoji || '🌱'} ${theme}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="flex justify-end mt-6">
                    <button onclick="getDifferentEntry()" 
                        class="bg-gradient-to-r from-blue-500 to-teal-500 text-white px-6 py-3 rounded-xl font-bold hover:from-blue-600 hover:to-teal-600 transition-all transform hover:scale-105 shadow-lg">
                        🔄 Different Entry
                    </button>
                </div>
            </div>
            <!-- Reflection Prompt Bubble -->
            <div class="glass rounded-3xl shadow-2xl p-10 card-hover mb-8">
                <div class="flex items-center mb-6">
                    <span class="text-4xl mr-4 float">💭</span>
                    <h3 class="text-2xl font-bold text-white mr-4 mb-0">Reflection Prompt</h3>
                    <button onclick="getNewReflectionPrompt()" 
                        class="ml-auto bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-xl font-bold hover:from-purple-600 hover:to-pink-600 transition-all transform hover:scale-105 shadow-lg text-base">
                        💭 New Prompt
                    </button>
                </div>
                <div class="bg-white/10 rounded-2xl p-6 border-l-4 border-purple-400 mb-8">
                    <p class="text-xl text-white font-medium">${prompt}</p>
                </div>
            </div>
            <!-- Reflection Form Bubble -->
            <div class="glass rounded-3xl shadow-2xl p-10 card-hover">
                <form onsubmit="addReflection(event, '${entry._id}')">
                    <div class="mb-8">
                        <textarea 
                            id="reflection-text"
                            rows="8" 
                            class="w-full p-6 border-2 border-white/30 rounded-2xl focus:border-purple-400 focus:outline-none resize-none text-gray-800 bg-white/80 backdrop-blur-sm placeholder-gray-600 text-lg leading-relaxed transition-all"
                            placeholder="Take your time to reflect deeply on this past entry. What do you notice? How have you changed? What insights emerge when you look back?"
                            required
                        ></textarea>
                    </div>
                    <button 
                        type="submit" 
                        class="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white py-4 px-8 rounded-2xl font-bold text-lg hover:from-purple-600 hover:via-pink-600 hover:to-red-600 transition-all transform hover:scale-105 shadow-xl glow"
                    >
                        🌱 Plant This Reflection
                    </button>
                </form>
            </div>
        </div>
    `;
}

async function addReflection(event, originalEntryId) {
    event.preventDefault();
    const text = document.getElementById('reflection-text').value.trim();

    if (!text) return;

    try {
        const response = await apiRequest('/api/entries', {
            method: 'POST',
            body: JSON.stringify({
                text: `Reflecting on my past entry: ${text}`,
                userId: USER_ID,
                isReflection: true,
                originalEntryId: originalEntryId
            })
        });

        if (response.success) {
            document.getElementById('reflection-text').value = '';
            showToast('🔄 Reflection added! Your insights are deepening!', 'success');

            // Load a new reflection after a short delay
            setTimeout(() => {
                fetchReflection();
            }, 1000);
        }
    } catch (error) {
        showToast(`Failed to add reflection: ${error.message}`, 'error');
    }
}

// Toast notification system
function showToast(message, type = 'info') {
    const toastTemplate = createToast(message, type);
    const toastContainer = document.getElementById('toast-container');

    toastContainer.appendChild(toastTemplate);
    const toast = toastContainer.lastElementChild;

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 100);

    // Animate out and remove
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 500);
    }, 3000);
}

// Weekly Summary functionality
async function generateWeeklySummary() {
    const button = document.getElementById('generate-summary-btn');
    const content = document.getElementById('weekly-review-content');

    // Show loading state
    button.textContent = 'Generating...';
    button.disabled = true;
    content.innerHTML = `
        <div class="text-center py-8">
            <div class="spinner mb-4 mx-auto"></div>
            <p class="text-white/70">Generating your weekly insights...</p>
        </div>
    `;

    try {
        const response = await apiRequest(`/api/weekly-summary?userId=${USER_ID}`);

        if (response.success) {
            updateWeeklySummary(response.summary);
        } else {
            throw new Error(response.error || 'Failed to generate weekly summary');
        }
    } catch (error) {
        console.error('Failed to generate weekly summary:', error);
        content.innerHTML = `
            <div class="text-center py-8">
                <span class="text-4xl mb-4 block">⚠️</span>
                <p class="text-white/70">Failed to generate weekly summary</p>
                <p class="text-white/50 text-sm mt-2">${error.message}</p>
            </div>
        `;
        showToast('Failed to generate weekly summary', 'error');
    } finally {
        button.textContent = 'Refresh';
        button.disabled = false;
    }
}

function updateWeeklySummary(summaryResponse) {
    const content = document.getElementById('weekly-review-content');

    // Handle case where no summary is available or API returned a message
    if (!summaryResponse || !summaryResponse.summary || summaryResponse.message) {
        const message = summaryResponse?.message || "No weekly summary available yet";
        const isNoEntries = message.includes("No entries found") || message.includes("Not enough entries");

        content.innerHTML = `
            <div class="text-center py-8">
                <span class="text-4xl mb-4 block">${isNoEntries ? '📝' : '⏰'}</span>
                <p class="text-white/70">${message}</p>
                ${isNoEntries ? '<p class="text-white/50 text-sm mt-2">Write more entries to generate insights!</p>' : ''}
            </div>
        `;
        return;
    }

    const summary = summaryResponse.summary;

    // The backend stores AI content in summary.summary, not summary.content
    const aiContent = summary.summary || summary.content;

    if (!aiContent) {
        content.innerHTML = `
            <div class="text-center py-8">
                <span class="text-4xl mb-4 block">📝</span>
                <p class="text-white/70">No weekly summary content available</p>
                <p class="text-white/50 text-sm mt-2">Try generating a new summary!</p>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="space-y-6">
            <div class="bg-white/10 rounded-2xl p-6">
                <h4 class="text-lg font-semibold text-white mb-3">Weekly Reflection</h4>
                <div class="text-white/90 leading-relaxed">
                    ${aiContent.replace(/\n/g, '<br>')}
                </div>
            </div>
            
            ${summary.topThemes && summary.topThemes.length > 0 ? `
                <div class="bg-white/10 rounded-2xl p-6">
                    <h4 class="text-lg font-semibold text-white mb-3">Key Themes This Week</h4>
                    <div class="flex flex-wrap gap-2">
                        ${summary.topThemes.map(theme => `
                            <span class="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                                ${themeData[theme]?.emoji || '🌱'} ${theme}
                            </span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div class="grid md:grid-cols-3 gap-4">
                <div class="bg-white/10 rounded-xl p-4 text-center">
                    <span class="text-2xl block mb-2">📝</span>
                    <div class="text-xl font-bold text-white">${summary.entryCount || 0}</div>
                    <div class="text-white/70 text-sm">Entries</div>
                </div>
                <div class="bg-white/10 rounded-xl p-4 text-center">
                    <span class="text-2xl block mb-2">${summary.avgSentiment > 0.1 ? '😊' : summary.avgSentiment < -0.1 ? '😔' : '😐'}</span>
                    <div class="text-xl font-bold text-white">${Math.round(((summary.avgSentiment || 0) + 1) * 50)}%</div>
                    <div class="text-white/70 text-sm">Positivity</div>
                </div>
                <div class="bg-white/10 rounded-xl p-4 text-center">
                    <span class="text-2xl block mb-2">🎭</span>
                    <div class="text-xl font-bold text-white">${summary.topThemes?.length || 0}</div>
                    <div class="text-white/70 text-sm">Themes</div>
                </div>
            </div>
            
            <div class="text-center">
                <p class="text-white/50 text-xs">
                    Generated on ${summary.generatedAt ? new Date(summary.generatedAt).toLocaleDateString() : new Date().toLocaleDateString()}
                </p>
            </div>
        </div>
    `;
}

// Initialize the app
document.addEventListener('DOMContentLoaded', async function () {
    // Load initial data
    await getNewPrompt();
    await fetchEntries();

    // Generate initial weekly summary
    await generateWeeklySummary();

    // Auto-resize textareas
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    });
});