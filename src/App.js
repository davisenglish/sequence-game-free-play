// Required dependencies: react, @fortawesome/react-fontawesome, @fortawesome/free-solid-svg-icons
// Tailwind CSS is used for styling (optional, or replace with your own CSS)
// Drop this file into your React project and import/use <WordPuzzleGame />
import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartSimple, faCheckCircle, faTimesCircle, faCircleQuestion, faHouseChimney } from '@fortawesome/free-solid-svg-icons';
import words from 'an-array-of-english-words';

// Preprocess the word list once for performance, excluding certain suffixes
const EXCLUDED_SUFFIXES = [
  'ING', 'ED', 'S', 'ER', 'EST', 'LY', 'ISH'
];
const suffixRegex = new RegExp(`(${EXCLUDED_SUFFIXES.join('|')})$`, 'i');
const PREPROCESSED_WORDS = words
  .filter(w =>
    w.length >= 3 &&
    /^[A-Za-z]+$/.test(w) &&
    !suffixRegex.test(w.toUpperCase())
  )
  .map(w => w.toUpperCase());

// Memoization cache for sequence counts
const sequenceCountCache = {};

async function getRandomLetters() {
  const candidates = PREPROCESSED_WORDS;
  const maxAttempts = 1000;
  // 75% chance to use hard mode
  const hardMode = Math.random() < 0.75;
  const minCount = hardMode ? 1 : 2;
  const minWordLength = hardMode ? 8 : 4;
  const sampleSize = 10000;
  const forbiddenThirdLetters = new Set(['S', 'G', 'D']);

  const filtered = candidates.filter(w => w.length >= minWordLength);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const word = filtered[Math.floor(Math.random() * filtered.length)];
    // Pick three increasing indices
    const idx1 = Math.floor(Math.random() * (word.length - 2));
    const idx2 = idx1 + 1 + Math.floor(Math.random() * (word.length - idx1 - 1));
    const idx3 = idx2 + 1 + Math.floor(Math.random() * (word.length - idx2 - 1));
    if (idx3 >= word.length) continue;
    const seq = word[idx1] + word[idx2] + word[idx3];
    // Enforce third letter restriction
    if (forbiddenThirdLetters.has(seq[2])) continue;
    // Skip if sequence is consecutive in the word
    if (word.includes(seq)) continue;
    // Memoized count of words containing these letters in order
    if (sequenceCountCache[seq]) {
      if (sequenceCountCache[seq] >= minCount) return seq;
      continue;
    }
    // Sample a subset for performance
    const sample = filtered.length > sampleSize
      ? Array.from({length: sampleSize}, () => filtered[Math.floor(Math.random() * filtered.length)])
      : filtered;
    const regex = new RegExp(seq.split('').join('.*'), 'i');
    const count = sample.filter(w => regex.test(w)).length;
    sequenceCountCache[seq] = count;
    if (count >= minCount) {
      return seq;
    }
  }
  // Fallback: random unique letters if no sequence found (should be rare)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let letters = '';
  while (letters.length < 3) {
    const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
    if (letters.length === 2 && forbiddenThirdLetters.has(randomLetter)) continue;
    if (!letters.includes(randomLetter)) letters += randomLetter;
  }
  return letters;
}

function isSequential(word, letters) {
  let idx = 0;
  const target = letters.toUpperCase();
  for (let char of word.toUpperCase()) {
    if (char === target[idx]) idx++;
    if (idx === target.length) return true;
  }
  return false;
}

async function isValidWord(word) {
  // Reject hyphenated words
  if (word.includes('-')) return false;
  
  // Reject swear words and inappropriate content
  const swearWords = [
    'fuck', 'shit', 'bitch', 'ass', 'damn', 'hell', 'crap', 'piss', 'cock', 'dick', 'pussy', 'cunt',
    'fucking', 'shitting', 'bitching', 'asshole', 'damned', 'hellish', 'crappy', 'pissing',
    'fucker', 'shitty', 'bitchy', 'asshat', 'damnit', 'hellfire', 'crapper', 'pisser',
    'motherfucker', 'bullshit', 'horseshit', 'dumbass', 'jackass', 'smartass', 'badass',
    'fuckin', 'shitty', 'bitchin', 'asswipe', 'damnit', 'hellish', 'crappy', 'pissy'
  ];
  
  const lowerWord = word.toLowerCase();
  if (swearWords.includes(lowerWord)) return false;
  
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (!response.ok) return false;
    const data = await response.json();
    return Array.isArray(data) && data[0]?.word?.toLowerCase() === word.toLowerCase();
  } catch {
    return false;
  }
}

// Helper to find 1-2 possible valid words for a given sequence
function findPossibleAnswers(letters, max = 2) {
  if (!letters || letters.length !== 3) return [];
  const regex = new RegExp(letters.split('').join('.*'), 'i');
  // Only use preprocessed words, as in the game
  const candidates = PREPROCESSED_WORDS.filter(w => regex.test(w));
  // Sort by length, then alphabetically, and return up to max
  return candidates.sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, max);
}

export default function WordPuzzleGame() {
  const [letters, setLetters] = useState('');
  const [roundStarted, setRoundStarted] = useState(false);
  const [input, setInput] = useState('');
  const [validWords, setValidWords] = useState([]); // { word, letters, bonusTime }
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [letterPopup, setLetterPopup] = useState(null);
  const [showRevealAnimation, setShowRevealAnimation] = useState(false);
  const [showAllWords, setShowAllWords] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    highestScores: [],
    fastestAnswers: [],
    mostWords: []
  });
  const [showRules, setShowRules] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLetters(await getRandomLetters());
    })();
    // Load stats from localStorage
    const savedStats = localStorage.getItem('sequenceGameStats');
    if (savedStats) {
      setStats(JSON.parse(savedStats));
    }
    
    // Detect mobile device
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleBegin = () => {
    setShowRevealAnimation(true);
    // Start the game after the reveal animation completes
    setTimeout(() => {
    setRoundStarted(true);
      // Focus the input field when the game starts
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100); // Small delay to ensure the input field is rendered
    }, 500); // Match the animation duration
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roundStarted || gameOver) return;
    const word = input.trim().toLowerCase();
    if (!word) { setError(true); setErrorMessage('Please enter a word'); return; }
    if (validWords.some(v => v.word === word)) { setError(true); setErrorMessage('Already guessed'); setInput(''); return; }
    if (!isSequential(word, letters)) { setError(true); setErrorMessage(`Word must contain '${letters}' in order`); return; }
    if (!(await isValidWord(word))) { setError(true); setErrorMessage('Not a valid English word'); return; }

    const baseScore = word.length;
    // Store word and its length
    setValidWords(prev => [...prev, { word, length: word.length }]);
    setScore(prev => prev + baseScore);
    setLetterPopup(`+${baseScore}`);
    setTimeout(() => setLetterPopup(null), 1500);
    setInput(''); setError(false); setErrorMessage('');
    
    // Keep focus on the input field
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  const handleEndGame = () => {
    setGameOver(true);
    // Update stats when game ends
    updateStats();
    // Show stats modal automatically after a brief delay
    setTimeout(() => setShowStats(true), 500);
  };

  const resetGame = () => {
    // If game was started but not finished, update stats based on performance
    if (roundStarted && !gameOver) {
      const newStats = { ...stats };
      newStats.gamesPlayed += 1;
      
      // If player found at least one word, count as a win and preserve streak
      if (validWords.length > 0) {
        newStats.gamesWon += 1;
        newStats.currentStreak += 1;
        // Update max streak if current streak is higher
        if (newStats.currentStreak > (newStats.maxStreak || 0)) {
          newStats.maxStreak = newStats.currentStreak;
        }
      } else {
        // If no words found, count as a loss and reset streak
        newStats.currentStreak = 0;
      }
      
      setStats(newStats);
      localStorage.setItem('sequenceGameStats', JSON.stringify(newStats));
    }
    
    setRoundStarted(false);
    setShowRevealAnimation(false);
    setShowAllWords(false);
    setShowStats(false);
    setShowInstructions(false);
    (async () => setLetters(await getRandomLetters()))();
    setInput(''); setValidWords([]); setScore(0);
    setError(false); setErrorMessage('');
    setGameOver(false); setLetterPopup(null);
  };

  const updateStats = () => {
    const newStats = { ...stats };
    
    // Ensure all required properties exist
    newStats.gamesPlayed = newStats.gamesPlayed || 0;
    newStats.gamesWon = newStats.gamesWon || 0;
    newStats.currentStreak = newStats.currentStreak || 0;
    newStats.maxStreak = newStats.maxStreak || 0;
    newStats.highestScores = newStats.highestScores || [];
    newStats.longestWords = newStats.longestWords || [];
    newStats.mostWords = newStats.mostWords || [];
    
    // Update games played
    newStats.gamesPlayed += 1;
    
    // Update games won (if player found at least 1 word)
    const hasWon = validWords.length > 0;
    if (hasWon) {
      newStats.gamesWon += 1;
      newStats.currentStreak += 1;
      // Update max streak if current streak is higher
      if (newStats.currentStreak > newStats.maxStreak) {
        newStats.maxStreak = newStats.currentStreak;
      }
    } else {
      newStats.currentStreak = 0;
    }
    
    // Update highest scores
    if (score > 0) {
      newStats.highestScores.push(score);
      newStats.highestScores.sort((a, b) => b - a); // Sort descending
      newStats.highestScores = newStats.highestScores.slice(0, 5); // Keep top 5
    }
    
    // Update longest words
    if (validWords.length > 0) {
      // Sort all words from this round by length (descending)
      const sortedWordsThisRound = [...validWords].sort((a, b) => b.length - a.length);
      
      // Add all words from this round to the longest words list
      sortedWordsThisRound.forEach(wordData => {
        newStats.longestWords.push({
          word: wordData.word,
          length: wordData.length
        });
      });
      
      // Sort by length descending, then by recency (newer words first for same length)
      newStats.longestWords.sort((a, b) => {
        if (b.length !== a.length) {
          return b.length - a.length; // Sort by length descending
        }
        // For same length, newer words come first
        // Since we're adding new words to the end, we want to reverse the order for same length
        return -1; // This will put newer words first for same length
      });
      
      // Remove duplicates (same word) - keep the first occurrence (newest)
      const seenWords = new Set();
      newStats.longestWords = newStats.longestWords.filter(item => {
        if (seenWords.has(item.word)) {
          return false; // Remove duplicate word
        }
        seenWords.add(item.word);
        return true;
      });
      
      newStats.longestWords = newStats.longestWords.slice(0, 3); // Keep top 3
    }
    
    // Update most words
    if (validWords.length > 0) {
      newStats.mostWords = newStats.mostWords || [];
      newStats.mostWords.push(validWords.length);
      newStats.mostWords.sort((a, b) => b - a); // Sort descending
      
      // Remove duplicates (same word count) - keep the first occurrence (newest)
      newStats.mostWords = [...new Set(newStats.mostWords)];
      
      newStats.mostWords = newStats.mostWords.slice(0, 3); // Keep top 3
    }
    
    setStats(newStats);
    localStorage.setItem('sequenceGameStats', JSON.stringify(newStats));
    
    // Store the current round's score for highlighting
    localStorage.setItem('currentRoundScore', score.toString());
    
    // Store the current round's longest word for highlighting
    if (validWords.length > 0) {
      // Sort all words from this round by length (descending)
      const sortedWordsThisRound = [...validWords].sort((a, b) => b.length - a.length);
      
      // Store all words from this round for highlighting
      localStorage.setItem('currentRoundLongestWords', JSON.stringify(
        sortedWordsThisRound.map(wordData => ({
          word: wordData.word,
          length: wordData.length
        }))
      ));
    }
    
    // Store the current round's word count for highlighting
    if (validWords.length > 0) {
      localStorage.setItem('currentRoundWordCount', validWords.length.toString());
    }
  };

  const handleInputChange = (e) => {
    if (!roundStarted || gameOver) return;
    setInput(e.target.value);
    if (error) { setError(false); setErrorMessage(''); }
  };

  const clearStats = () => {
    // Clear all statistical data
    localStorage.removeItem('sequenceGameStats');
    localStorage.removeItem('currentRoundScore');
    localStorage.removeItem('currentRoundLongestWords');
    localStorage.removeItem('currentRoundWordCount');
    
    // Reset stats to initial state
    setStats({
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
      highestScores: [],
      longestWords: [],
      mostWords: []
    });
  };

  const shapes = [
    { shape: 'circle', color: '#c85f31' },
    { shape: 'diamond', color: '#195b7c' },
    { shape: 'square', color: '#1c6d2a' }
  ];
  const size = 80;

  return (
    <div className="p-6 max-w-xl mx-auto text-center space-y-6 relative overflow-hidden">
      <div className="flex justify-center items-center relative flex-col">
        {!roundStarted && (
          <>
            <img 
              src={process.env.PUBLIC_URL + "/letter-game-logo2.png"} 
              alt="Sequence Game Logo" 
              className="w-24 h-24 mb-4 object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <h1 className="text-3xl font-bold">Sequence</h1>
          </>
        )}
        {!roundStarted && (
          <p className="text-gray-500 italic mt-4 text-center">
            Make words.<br />
            Tickle your brain.
          </p>
        )}
        {roundStarted && (
          <div className="flex items-center space-x-3">
            <a 
              href="https://davisenglish.github.io/sequence-game-home/"
              className="text-gray-600 hover:text-gray-800 transition-colors"
              title="Home"
            >
              <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
            </a>
            <button 
              onClick={() => setShowStats(true)}
              className="text-gray-600 hover:text-gray-800 transition-colors"
              title="Statistics"
            >
              <FontAwesomeIcon icon={faChartSimple} className="text-lg" />
            </button>
            <button 
              onClick={() => setShowRules(true)}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title="Rules"
            >
              <FontAwesomeIcon icon={faCircleQuestion} className="text-xl" />
            </button>
            
            {/* Tooltip-style instructions */}
            {showInstructions && (
              <div className={`${isMobile ? 'fixed inset-0 z-50' : 'fixed top-20 left-1/2 transform -translate-x-1/2 z-50 mx-4'}`} onClick={isMobile ? () => setShowInstructions(false) : undefined}>
                <div className={`${isMobile ? 'fixed top-20 left-1/2 transform -translate-x-1/2 mx-4' : ''}`} onClick={isMobile ? (e) => e.stopPropagation() : undefined}>
                  <div className="bg-gray-800 text-white text-sm rounded-lg p-4 shadow-lg max-w-md w-full">
                    {/* Arrow pointing up */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800"></div>
                    
                    <p className="leading-relaxed">
                      Use the provided letters, in the order they appear, to create words—there can be other letters before, after and between the provided letters, as long as they remain in Sequence.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!roundStarted ? (
        <div className="flex flex-col items-center space-y-3">
        <button onClick={handleBegin} className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded">BEGIN : FREE PLAY</button>
          <div className="flex flex-row items-center space-x-4">
            <a 
              href="https://davisenglish.github.io/sequence-game-home/"
              className="text-gray-600 hover:text-gray-800 transition-colors"
              title="Home"
            >
              <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
            </a>
            <button onClick={() => setShowStats(true)} className="text-gray-600 hover:text-gray-800 transition-colors" title="Statistics">
              <FontAwesomeIcon icon={faChartSimple} className="text-lg" />
            </button>
            <button onClick={() => setShowRules(true)} className="text-gray-500 hover:text-gray-700 transition-colors" title="Rules">
              <FontAwesomeIcon icon={faCircleQuestion} className="text-xl" />
            </button>
          </div>
        </div>
      ) : (
        <div className={`flex justify-center space-x-3 items-center ${showRevealAnimation ? 'reveal-content' : ''}`}>
          {letters.split('').map((char, idx) => {
            const { shape, color } = shapes[idx];
            const common = { 
              width:`${size}px`, 
              height:`${size}px`, 
              display:'flex', 
              alignItems:'center', 
              justifyContent:'center', 
              color:'white', 
              fontSize:'1.75rem', 
              fontWeight:'600',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              transition: 'all 0.2s ease-in-out'
            };
            const style = shape==='circle' ? {
              ...common, 
              backgroundColor:color, 
              borderRadius:'50%',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            } : shape==='diamond' ? {
              ...common, 
              backgroundColor:color, 
              borderRadius:'12px',
              transform: 'rotate(45deg) scale(0.85)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            } : {
              ...common, 
              backgroundColor:color,
              borderRadius:'12px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            };
            return (
              <div key={idx} style={style} className="hover:scale-105 transition-transform duration-200 relative">
                {shape === 'diamond' ? (
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.75rem',
                    fontWeight: 600,
                    color: 'white',
                    transform: 'rotate(-45deg) scale(1.176)', // Compensate for parent scale(0.85)
                  }}>
                    {char}
                  </span>
                ) : (
                  <span>{char}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* The time left display is removed */}

      {roundStarted && (
        <div className={`space-y-4 ${showRevealAnimation ? 'reveal-content' : ''}`}>
          {gameOver ? (
            <div></div>
          ) : (
            <>
              <input 
                ref={inputRef}
                type="text" 
                value={input} 
                onChange={handleInputChange}
                className={`border rounded px-4 py-2 w-full text-lg ${error?'border-red-600 text-red-600':''}`}
                placeholder="Enter word..." 
                disabled={!roundStarted||gameOver}
                onKeyDown={e=>e.key==='Enter'&&handleSubmit(e)} 
              />
              {error&&<p className="text-red-600">{errorMessage}</p>}
              <div className="relative inline-block">
                <button onClick={handleSubmit} style={{backgroundColor:'#195b7c'}} className="text-white px-4 py-2 rounded text-lg disabled:opacity-50" disabled={!roundStarted||gameOver}>Submit</button>
              </div>
            </>
          )}
        </div>
      )}

      {roundStarted && (
        <>
          <div className={`mt-4 ${showRevealAnimation ? 'reveal-content' : ''}`}>
            <div className="relative inline-block font-bold text-center">
              <div className={gameOver ? 'text-2xl' : 'text-lg'}>
                {gameOver ? 'Final Score' : 'Total Score'}: {score}
              </div>
              {letterPopup && (
                <span className="absolute inset-0 flex items-center justify-center text-green-600 font-bold animate-float-up" style={{fontSize:'12pt'}}>{letterPopup}</span>
              )}
            </div>
            {/* The time bonus progress bar and related elements are removed */}
            </div>
          <div className={`text-center ${showRevealAnimation ? 'reveal-content' : ''}`}>
            {/* Compact word display - shows last 3 words with total count */}
            <div className="flex flex-col items-center space-y-2">
              {gameOver && (
                <div className="text-sm text-gray-600 flex flex-col items-center justify-center">
                  {validWords.length > 0 ? (
                    <span>Word Count: {validWords.length}</span>
                  ) : null}
                  {validWords.length === 0 && (() => {
                    const possible = findPossibleAnswers(letters);
                    return possible.length > 0 ? (
                      <div className="mt-3 flex flex-col items-center">
                        <span className="text-xs text-gray-500">Possible Answers:</span>
                        <span className="text-xs text-gray-500 mt-0.5">{possible.join(', ')}</span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              
              {showAllWords ? (
                /* Show all words in expanded view - most recent first */
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {validWords.slice().reverse().map(({word,length},idx)=>(
                    <div key={idx} className="rounded-lg px-3 py-1 flex items-center space-x-1" style={{backgroundColor: 'rgba(28, 109, 42, 0.15)', border: '1px solid rgba(28, 109, 42, 0.3)'}}>
                      <span className="font-medium text-sm" style={{color: '#1c6d2a'}}>{word}</span>
                      <span className="text-xs" style={{color: '#1c6d2a'}}>({length})</span>
                    </div>
                  ))}
                </div>
              ) : (
                /* Show last 3 words in compact format - most recent first */
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {validWords.slice(-3).reverse().map(({word,length},idx)=>(
                    <div key={idx} className="rounded-lg px-3 py-1 flex items-center space-x-1" style={{backgroundColor: 'rgba(28, 109, 42, 0.15)', border: '1px solid rgba(28, 109, 42, 0.3)'}}>
                      <span className="font-medium text-sm" style={{color: '#1c6d2a'}}>{word}</span>
                      <span className="text-xs" style={{color: '#1c6d2a'}}>({length})</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Show clickable text to expand/collapse */}
              {validWords.length > 3 && (
                <button 
                  onClick={() => setShowAllWords(!showAllWords)}
                  className="text-xs text-gray-800 font-bold underline hover:text-gray-600 transition-colors cursor-pointer"
                >
                  {showAllWords ? 'Show less' : `+${validWords.length - 3} more words`}
                </button>
              )}
            </div>
          </div>

          <div className={`flex flex-col items-center space-y-3 ${showRevealAnimation ? 'reveal-content' : ''}`}>
            {gameOver ? (
              <button onClick={resetGame} className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded">NEW GAME</button>
            ) : (
              <button onClick={handleEndGame} className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded">END GAME</button>
            )}
          </div>
        </>
      )}

      {/* Statistics Modal */}
      {showStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] modal-fade-in" style={{ top: '-100vh', left: '-100vw', right: '-100vw', bottom: '-100vh', width: '300vw', height: '300vh' }}>
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:max-w-md mx-4 sm:mx-6 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold">Statistics</h2>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={clearStats}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-300 rounded"
                >
                  Clear Stats
                </button>
                <button 
                  onClick={() => setShowStats(false)}
                  className="text-gray-500 hover:text-gray-700 text-lg sm:text-xl font-bold"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-2 mb-6 sm:mb-8">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{stats.gamesPlayed}</div>
                <div className="text-xs text-gray-600">Played</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">
                  {stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%
                </div>
                <div className="text-xs text-gray-600">Win %</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{stats.currentStreak}</div>
                <div className="text-xs text-gray-600">Streak</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{stats.maxStreak || 0}</div>
                <div className="text-xs text-gray-600">Max Streak</div>
              </div>
            </div>
            
            {/* Highest Scores */}
            <div className="mb-6 sm:mb-8">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Highest Scores</h3>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((position) => {
                  const score = (stats.highestScores && stats.highestScores[position - 1]) || 0;
                  const currentRoundScore = parseInt(localStorage.getItem('currentRoundScore') || '0');
                  const isCurrentRound = score === currentRoundScore && score > 0;
                  const maxScore = Math.max(...(stats.highestScores || []), 1);
                  const barWidth = score > 0 ? (score / maxScore) * 100 : 10;
                  
                  return (
                    <div key={position} className="flex items-center space-x-3">
                      <span className="text-sm font-medium w-4">{position}</span>
                      <div className="flex-1 bg-gray-300 rounded-full h-6 relative">
                        <div 
                          className={`h-6 rounded-full ${isCurrentRound ? 'bg-green-600' : 'bg-gray-500'}`}
                          style={{ 
                            width: `${barWidth}%`,
                            backgroundColor: isCurrentRound ? '#1c6d2a' : undefined
                          }}
                        ></div>
                        <span className="absolute right-2 top-0.5 text-sm font-medium text-white">
                          {score}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Longest Words and Highest Word Count */}
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {/* Longest Words */}
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-left">Longest Words</h3>
                <div className="space-y-2">
                  {[1, 2, 3].map((position) => {
                    const longestWord = (stats.longestWords && stats.longestWords[position - 1]) || null;
                    const currentRoundLongestWords = JSON.parse(localStorage.getItem('currentRoundLongestWords') || '[]');
                    const isCurrentRound = longestWord && currentRoundLongestWords.some(currentWord => 
                      currentWord.word === longestWord.word && currentWord.length === longestWord.length
                    );
                    
                    return (
                      <div key={position} className="flex items-center space-x-3">
                        <span className="text-sm font-medium w-4">{position}</span>
                        <span 
                          className="text-sm text-left"
                          style={{ color: isCurrentRound ? '#1c6d2a' : undefined }}
                        >
                          {longestWord ? `${longestWord.word} (${longestWord.length})` : '-'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Highest Word Count */}
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-left">Highest Word Count</h3>
                <div className="space-y-2">
                  {[1, 2, 3].map((position) => {
                    const wordCount = (stats.mostWords && stats.mostWords[position - 1]) || null;
                    const currentRoundWordCount = parseInt(localStorage.getItem('currentRoundWordCount') || '0');
                    const isCurrentRound = wordCount && wordCount === currentRoundWordCount;
                    
                    return (
                      <div key={position} className="flex items-center space-x-3">
                        <span className="text-sm font-medium w-4">{position}</span>
                        <span 
                          className="text-sm text-left"
                          style={{ color: isCurrentRound ? '#1c6d2a' : undefined }}
                        >
                          {wordCount ? `${wordCount} ${wordCount === 1 ? 'word' : 'words'}` : '-'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] modal-fade-in" style={{ top: '-100vh', left: '-100vw', right: '-100vw', bottom: '-100vh', width: '300vw', height: '300vh' }}>
          <div
            className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:max-w-md mx-4 sm:mx-6"
            style={{
              maxHeight: '90vh',
              overflow: 'visible',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              boxSizing: 'border-box',
              textAlign: 'left',
              // Responsive scaling for mobile
              transform: 'scale(1)',
              ...(window.innerWidth < 400 ? { transform: 'scale(0.92)' } : {}),
              ...(window.innerHeight < 600 ? { maxHeight: '80vh', transform: 'scale(0.92)' } : {}),
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-left">Rules</h2>
              <button 
                onClick={() => setShowRules(false)}
                className="text-gray-500 hover:text-gray-700 text-lg sm:text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="mb-4 text-base font-medium">Use the provided letters to create words.</div>
            <ul className="mb-3 text-sm list-disc pl-5 space-y-1">
              <li>Provided letters must be used in the order they appear.</li>
              <li>There can be letters before, after and between the provided letters, as long as they remain in order.</li>
              <li>+1 point per letter in each word.</li>
            </ul>
            <div className="mb-1 mt-2 text-base font-semibold">Example</div>
            <div className="mb-1 text-xs font-medium">Provided Letters:</div>
            {/* LIN example, small */}
            <div className="flex space-x-1 mb-2" style={{ transform: 'scale(0.7)', transformOrigin: 'left' }}>
              <div style={{ width: 36, height: 36, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>L</div>
              <div style={{ width: 36, height: 36, background: '#195b7c', borderRadius: 8, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
              </div>
              <div style={{ width: 36, height: 36, background: '#1c6d2a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>N</div>
            </div>
            <div className="mb-1 text-xs font-medium">Possible Answers:</div>
            {/* PLAIN example */}
            <div className="flex items-center space-x-1 mb-1">
              <span>P</span>
              <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
              <span>A</span>
              <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
              </div>
              <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
            </div>
            <div className="flex items-center mb-3 text-xs" style={{ color: '#1c6d2a' }}>
              <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Valid word—nonconsecutive provided letters
            </div>
            {/* LINK example */}
            <div className="flex items-center space-x-1 mb-1">
              <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
              <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
              </div>
              <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
              <span>K</span>
            </div>
            <div className="flex items-center mb-3 text-xs" style={{ color: '#1c6d2a' }}>
              <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Valid word—consecutive provided letters.
            </div>
            {/* NAIL (invalid) example */}
            <div className="flex items-center space-x-1 mb-1">
              <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
              <span>A</span>
              <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
              </div>
              <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
            </div>
            <div className="flex items-center mb-1 text-xs" style={{ color: '#992108' }}>
              <FontAwesomeIcon icon={faTimesCircle} className="mr-1" /> Invalid word—letters appear out of order from provided letters.
            </div>
          </div>
        </div>
      )}


      <style>{`
        @keyframes float-up {0%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-40px)}}
        .animate-float-up{animation:float-up 1.5s ease-out}
        
        @keyframes reveal-from-top {
          0% {
            opacity: 0;
            transform: translateY(-30px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .reveal-content {
          animation: reveal-from-top 0.5s ease-out forwards;
        }
        
        @keyframes modal-fade-in {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        
        .modal-fade-in {
          animation: modal-fade-in 0.2s ease-out forwards;
        }
      `}</style>
      
      {/* Footer */}
      <footer className="text-center py-4 mt-8">
        <p className="text-gray-500 italic text-sm">© 2025 Davis English. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
