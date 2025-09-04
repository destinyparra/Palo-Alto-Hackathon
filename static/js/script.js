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
        container.innerHTML = `
            <div class="text-center py-12">
                <span class="text-8xl mb-6 block float">🌱</span>
                <p class="text-white/70 text-lg">No entries yet</p>
                <p class="text-white/50">Start writing to see your thoughts bloom!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = entries.map(entry => {
        const date = new Date(entry.createdAt);
        const sentimentEmoji = entry.sentiment > 0.1 ? '😊' : entry.sentiment < -0.1 ? '😔' : '😐';
        const isReflection = entry.isReflection;
        const expanded = expandedEntries[entry._id];
        let reflectionOriginal = '';
        if (isReflection && expanded && entry.originalEntryId) {
            // Show loading spinner, will be replaced after fetch
            reflectionOriginal = `<div class="bg-white/10 rounded-xl p-4 mb-2 text-sm text-gray-700" id="original-entry-${entry._id}">Loading original entry...</div>`;
        }
        return `
            <div class="entry-card rounded-2xl p-6 shadow-lg bloom ${isReflection ? 'border-l-4 border-purple-400' : ''} cursor-pointer select-none" data-entry-id="${entry._id}">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center space-x-2">
                        <span class="text-sm text-gray-600 font-medium">
                            ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        ${isReflection ? '<span class="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full font-medium">Reflection</span>' : ''}
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="text-2xl">${sentimentEmoji}</span>
                        ${entry.confidence ? `<span class="text-xs text-gray-500">${Math.round(entry.confidence * 100)}%</span>` : ''}
                    </div>
                </div>
                ${expanded ? `
                    ${isReflection && entry.originalEntryId ? reflectionOriginal : ''}
                    <p class="text-gray-800 mb-4 leading-relaxed">${entry.text}</p>
                ` : `
                    <p class="text-gray-800 mb-4 leading-relaxed">${entry.summary || entry.text.substring(0, 150) + '...'}</p>
                `}
                ${entry.themes && entry.themes.length > 0 ? `
                    <div class="flex flex-wrap gap-2">
                        ${entry.themes.map(theme => `
                            <span class="theme-badge px-3 py-1 rounded-full text-xs font-semibold text-gray-700">
                                ${themeData[theme]?.emoji || '🌱'} ${theme}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
                ${entry.wordCount ? `
                    <div class="mt-2 text-xs text-gray-500">
                        ${entry.wordCount} words • ${entry.emotion || 'neutral'} emotion
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Add click handlers for expand/collapse
    Array.from(container.getElementsByClassName('entry-card')).forEach(card => {
        card.addEventListener('click', async function (e) {
            // Prevent click on links/buttons inside card
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
            const entryId = card.getAttribute('data-entry-id');
            expandedEntries[entryId] = !expandedEntries[entryId];
            updateEntriesList();
            // If expanded and is reflection, fetch original entry if needed
            const entry = entries.find(en => en._id === entryId);
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
        container.innerHTML = `
            <div class="text-center py-16">
                <span class="text-8xl mb-6 block float">💎</span>
                <h3 class="text-3xl font-bold text-white mb-4">No Reflections Yet</h3>
                <p class="text-white/70 text-lg mb-8">Start reflecting on your past entries to build your collection of insights!</p>
                <button onclick="showSection('reflect')" class="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-xl font-bold hover:from-purple-600 hover:to-pink-600 transition-all transform hover:scale-105 shadow-xl">
                    ✨ Start Reflecting
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="space-y-8">
            ${reflections.map(reflection => {
        const date = new Date(reflection.createdAt);
        const originalDate = reflection.originalEntry ? new Date(reflection.originalEntry.createdAt) : null;

        return `
                    <div class="glass rounded-3xl shadow-2xl p-8 card-hover">
                        <div class="flex justify-between items-start mb-6">
                            <div class="flex items-center space-x-3">
                                <span class="text-3xl float">💭</span>
                                <div>
                                    <h3 class="text-xl font-bold text-white">Reflection from ${date.toLocaleDateString()}</h3>
                                    ${originalDate ? `<p class="text-sm text-white/70">Reflecting on entry from ${originalDate.toLocaleDateString()}</p>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center space-x-2 bg-white/20 rounded-full px-4 py-2">
                                <span class="text-2xl">${reflection.sentiment > 0.1 ? '😊' : reflection.sentiment < -0.1 ? '😔' : '😐'}</span>
                            </div>
                        </div>

                        ${reflection.originalEntry ? `
                            <div class="mb-6 p-4 bg-white/10 rounded-2xl border-l-4 border-white/30">
                                <p class="text-sm text-white/70 mb-2">Original Entry:</p>
                                <p class="text-white/90 italic">
                                    "${reflection.originalEntry.text.length > 150 ? reflection.originalEntry.text.substring(0, 150) + '...' : reflection.originalEntry.text}"
                                </p>
                            </div>
                        ` : ''}

                        <div class="mb-4">
                            <p class="text-white leading-relaxed">${reflection.text}</p>
                        </div>

                        ${reflection.themes && reflection.themes.length > 0 ? `
                            <div class="flex flex-wrap gap-2">
                                ${reflection.themes.map(theme => `
                                    <span class="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                                        ${themeData[theme]?.emoji || '🌱'} ${theme}
                                    </span>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
    }).join('')}
            
            ${hasMoreReflections ? `
                <div class="text-center pt-8">
                    <button onclick="loadMoreReflections()" class="text-white/70 hover:text-white underline font-medium">
                        Load more reflections
                    </button>
                </div>
            ` : ''}
        </div>
    `;
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
        container.innerHTML = `
            <div class="col-span-full text-center py-16">
                <span class="text-8xl mb-6 block float">🏡</span>
                <h3 class="text-3xl font-bold text-white mb-4">Your Garden Awaits</h3>
                <p class="text-white/70 text-lg mb-8">Start journaling to plant your first seeds!</p>
                <button onclick="showSection('journal')" class="bg-gradient-to-r from-green-500 to-blue-500 text-white px-8 py-4 rounded-xl font-bold hover:from-green-600 hover:to-blue-600 transition-all transform hover:scale-105 shadow-xl">
                    🌱 Plant Your First Seed
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = gardenData.map(plant => {
        const themeInfo = themeData[plant.theme] || { emoji: '🌱', name: 'Plant', color: 'from-green-400 to-green-600' };
        const progress = plant.stage === 'blooming' ? 100 :
            plant.stage === 'growing' ? 75 :
                plant.stage === 'sprouting' ? 40 : 15;

        return `
            <div class="plant-card rounded-3xl shadow-2xl p-8 card-hover relative overflow-hidden">
                <div class="absolute inset-0 opacity-10 bg-gradient-to-br ${themeInfo.color}"></div>
                
                <div class="text-center mb-6 relative z-10">
                    <div class="text-6xl mb-4 float relative">
                        ${themeInfo.emoji}
                        ${plant.stage === 'blooming' ? '<div class="absolute -top-2 -right-2 text-yellow-400 text-lg sparkle">✨</div>' : ''}
                    </div>
                    <h3 class="text-2xl font-bold text-gray-800 mb-2">${themeInfo.name || plant.theme.charAt(0).toUpperCase() + plant.theme.slice(1)}</h3>
                    <p class="text-gray-600 text-sm capitalize">${plant.theme} theme</p>
                </div>

                <div class="mb-6 relative z-10">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm font-semibold text-gray-700 capitalize">${plant.stage}</span>
                        <span class="text-sm text-gray-500">${plant.count} entries</span>
                    </div>
                    
                    <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${themeInfo.color}" 
                             style="width: ${progress}%;">
                        </div>
                    </div>
                </div>

                <div class="text-center relative z-10">
                    <span class="inline-block bg-gray-100 text-gray-700 px-4 py-2 rounded-full text-sm font-semibold border border-gray-200">
                        ${plant.theme.charAt(0).toUpperCase() + plant.theme.slice(1)}
                    </span>
                </div>

                ${plant.nextStageNeeds && plant.nextStageNeeds > 0 ? `
                    <div class="mt-4 text-center text-xs text-gray-500 relative z-10">
                        ${plant.nextStageNeeds} more entries to reach next stage! 🌸
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
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

        statsGrid.innerHTML = `
            <div class="text-center p-6 bg-white/20 rounded-xl shadow-sm">
                <span class="text-4xl mb-3 block float">🌳</span>
                <h4 class="font-bold text-2xl text-white">${response.bloomingPlants}</h4>
                <p class="text-white/70 text-sm">Blooming Plants</p>
            </div>
            
            <div class="text-center p-6 bg-white/20 rounded-xl shadow-sm">
                <span class="text-4xl mb-3 block float">🌿</span>
                <h4 class="font-bold text-2xl text-white">${growingPlants}</h4>
                <p class="text-white/70 text-sm">Growing Plants</p>
            </div>
            
            <div class="text-center p-6 bg-white/20 rounded-xl shadow-sm">
                <span class="text-4xl mb-3 block float">🌱</span>
                <h4 class="font-bold text-2xl text-white">${sproutingPlants + seedlingPlants}</h4>
                <p class="text-white/70 text-sm">Young Plants</p>
            </div>
            
            <div class="text-center p-6 bg-white/20 rounded-xl shadow-sm">
                <span class="text-4xl mb-3 block float">💧</span>
                <h4 class="font-bold text-2xl text-white">${totalWaterings}</h4>
                <p class="text-white/70 text-sm">Total Waterings</p>
            </div>
        `;
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
        container.innerHTML = `
            <div class="text-center py-16">
                <span class="text-8xl mb-6 block float">💎</span>
                <h3 class="text-3xl font-bold text-white mb-4">Insights Await Discovery</h3>
                <p class="text-white/70 text-lg">Write more entries to unlock insights about your emotional patterns and themes!</p>
            </div>
        `;
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

    container.innerHTML = `
        <div class="grid lg:grid-cols-3 gap-8 mb-12">
            <!-- Sentiment Overview -->
            <div class="glass rounded-3xl shadow-2xl p-8 card-hover">
                <div class="text-center">
                    <span class="text-6xl mb-6 block float">${sentimentEmoji}</span>
                    <h3 class="text-2xl font-bold text-white mb-4">Emotional Weather</h3>
                    <p class="text-3xl font-bold mb-4 ${sentimentColor}">
                        ${sentimentDescription}
                    </p>
                    <div class="w-full bg-white/20 rounded-full h-3 mb-4">
                        <div class="bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 h-3 rounded-full relative">
                            <div class="absolute bg-white border-2 border-gray-400 rounded-full w-5 h-5 -top-1 transform -translate-x-2.5" 
                                 style="left: ${((data.avgSentiment + 1) * 50)}%;">
                            </div>
                        </div>
                    </div>
                    <p class="text-sm text-white/70">Score: ${data.avgSentiment.toFixed(3)}</p>
                </div>
            </div>

            <!-- Top Themes -->
            <div class="lg:col-span-2 glass rounded-3xl shadow-2xl p-8 card-hover">
                <div class="flex items-center mb-6">
                    <span class="text-3xl mr-3 float">🌿</span>
                    <h3 class="text-2xl font-bold text-white">Themes in Focus</h3>
                </div>
                
                ${data.topThemes && data.topThemes.length > 0 ? `
                    <div class="space-y-4">
                        ${data.topThemes.map(theme => `
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
                                             style="width: ${(data.themeCounts[theme] / Math.max(...Object.values(data.themeCounts)) * 100)}%"></div>
                                    </div>
                                    <span class="text-sm font-medium text-white">${data.themeCounts[theme]}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="text-center py-8">
                        <span class="text-6xl mb-4 block float">🌱</span>
                        <p class="text-white/70">No themes detected yet</p>
                    </div>
                `}
            </div>
        </div>

        <!-- Advanced Insights -->
        ${data.insights ? `
            <div class="glass rounded-3xl p-8 shadow-xl mb-12">
                <div class="text-center mb-8">
                    <span class="text-4xl mb-4 block float">🧠</span>
                    <h3 class="text-2xl font-bold text-white mb-2">Advanced Insights</h3>
                    <p class="text-white/70">Deeper patterns in your writing</p>
                </div>
                
                <div class="grid md:grid-cols-3 gap-6">
                    <div class="text-center p-6 bg-white/10 rounded-2xl">
                        <span class="text-4xl mb-3 block float">📝</span>
                        <h4 class="font-bold text-2xl text-white">${data.insights.avgWordCount || 0}</h4>
                        <p class="text-white/70 text-sm">Avg Words/Entry</p>
                    </div>
                    
                    <div class="text-center p-6 bg-white/10 rounded-2xl">
                        <span class="text-4xl mb-3 block float">📈</span>
                        <h4 class="font-bold text-2xl text-white capitalize">${data.insights.sentimentTrend || 'stable'}</h4>
                        <p class="text-white/70 text-sm">Mood Trend</p>
                    </div>
                    
                    <div class="text-center p-6 bg-white/10 rounded-2xl">
                        <span class="text-4xl mb-3 block float">⏰</span>
                        <h4 class="font-bold text-2xl text-white">${data.insights.mostActiveHour ? data.insights.mostActiveHour + ':00' : 'N/A'}</h4>
                        <p class="text-white/70 text-sm">Most Active Hour</p>
                    </div>
                </div>
            </div>
        ` : ''}

        <!-- Weekly Summary -->
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
        </div>
    `;
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
        container.innerHTML = `
            <div class="text-center py-16">
                <span class="text-8xl mb-6 block float">⏰</span>
                <h3 class="text-3xl font-bold text-white mb-4">No Past Entries Yet</h3>
                <p class="text-white/70 text-lg">Start journaling to create memories worth reflecting on!</p>
            </div>
        `;
        return;
    }

    const entry = currentReflectionEntry;
    const date = new Date(entry.createdAt);
    const prompt = currentReflectionPrompt;

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
    const toast = document.createElement('div');
    toast.className = `glass rounded-2xl p-4 shadow-lg transform transition-all duration-500 translate-x-full ${type === 'success' ? 'border-l-4 border-green-400' :
        type === 'error' ? 'border-l-4 border-red-400' :
            'border-l-4 border-blue-400'
        }`;

    toast.innerHTML = `
        <div class="flex items-center space-x-3">
            <span class="text-lg">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <p class="text-white font-medium">${message}</p>
        </div>
    `;

    document.getElementById('toast-container').appendChild(toast);

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

// Initialize the app
document.addEventListener('DOMContentLoaded', async function () {
    // Load initial data
    await getNewPrompt();
    await fetchEntries();

    // Auto-resize textareas
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    });
});