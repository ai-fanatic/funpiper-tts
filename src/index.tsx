import * as React from "react"
import * as ReactDOM from "react-dom/client"
import { useImmer } from "use-immer"
import { playAudio } from "./audio"
import config from "./config"
import { advertiseVoices, deleteVoice, getPopularity, getVoiceList, installVoice, makeAdvertisedVoiceList, messageDispatcher, parseAdvertisedVoiceName, sampler, updateStats } from "./services"
import { makeSpeech } from "./speech"
import * as storage from "./storage"
import { makeSynthesizer } from "./synthesizer"
import { MyVoice, PcmData, PlayAudio, AudioPlaying } from "./types"
import { immediate, makeWav } from "./utils"

const query = new URLSearchParams(location.search)
const synthesizers = new Map<string, ReturnType<typeof makeSynthesizer>>()
let currentSpeech: ReturnType<typeof makeSpeech>|undefined

function ReadingViewText({text, currentStart, currentEnd}: {
  text: string
  currentStart: number
  currentEnd: number
}) {
  const highlightRef = React.useRef<HTMLSpanElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  
  React.useEffect(() => {
    if (currentStart >= 0 && currentEnd > currentStart && highlightRef.current && containerRef.current) {
      // Scroll the highlighted element into view
      setTimeout(() => {
        if (highlightRef.current && containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect()
          const highlightRect = highlightRef.current.getBoundingClientRect()
          const scrollOffset = highlightRect.top - containerRect.top - containerRect.height / 2 + highlightRect.height / 2
          containerRef.current.scrollBy({
            top: scrollOffset,
            behavior: 'smooth'
          })
        }
      }, 100)
    }
  }, [currentStart, currentEnd])

  // Split text into parts: before highlight, highlight, after highlight
  const beforeText = currentStart >= 0 && currentEnd > currentStart ? text.substring(0, currentStart) : ""
  const highlightText = currentStart >= 0 && currentEnd > currentStart ? text.substring(currentStart, currentEnd) : ""
  const afterText = currentEnd > 0 && currentEnd < text.length ? text.substring(currentEnd) : ""

  return (
    <div ref={containerRef} style={{position: "relative", minHeight: "100%"}}>
      {currentStart >= 0 && currentEnd > currentStart ? (
        <>
          <span>{beforeText}</span>
          <span 
            ref={highlightRef}
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              padding: "0.2rem 0.4rem",
              borderRadius: "4px",
              fontWeight: "600",
              boxShadow: "0 2px 8px rgba(102, 126, 234, 0.4)",
              transition: "all 0.3s ease",
              display: "inline"
            }}>
            {highlightText}
          </span>
          <span>{afterText}</span>
        </>
      ) : (
        <span>{text}</span>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById("app")!).render(<App />)


function App() {
  const [state, stateUpdater] = useImmer({
    voiceList: null as MyVoice[]|null,
    popularity: {} as {[voiceKey: string]: number},
    activityLog: "",
    isExpanded: {} as Record<string, boolean>,
    showInfoBox: false,
    sectionsCollapsed: {
      installed: false,
      available: false,
    },
    test: {
      current: null as null|{type: "speaking"}|{type: "synthesizing", percent: number},
      downloadUrl: null as string|null
    },
    selectedCountry: null as string|null,
    playingSample: null as {voiceKey: string, speakerId?: number}|null,
    urlConversions: [] as Array<{
      id: string,
      url: string,
      title: string,
      text: string,
      voiceName: string,
      createdAt: number
    }>,
    urlConversion: {
      url: "",
      loading: false,
      error: null as string|null
    },
    readingView: {
      show: false,
      text: "",
      currentSentenceStart: -1,
      currentSentenceEnd: -1,
      sentenceStartIndicies: [] as number[]
    }
  })
  const refs = {
    activityLog: React.useRef<HTMLTextAreaElement>(null!),
  }
  
  // Filter to only English and Hindi (India) languages
  const isLanguageAllowed = (voice: MyVoice) => {
    const langCode = voice.language.code.toLowerCase()
    const country = voice.language.country_english.toLowerCase()
    // English: en_* codes or English-speaking countries
    // Hindi: hi_IN code or India country
    return langCode.startsWith('en') || 
           langCode === 'hi_in' || 
           (langCode.startsWith('hi') && country.includes('india'))
  }
  
  const installed = React.useMemo(() => 
    state.voiceList?.filter(x => x.installState == "installed" && isLanguageAllowed(x)) ?? [], 
    [state.voiceList]
  )
  const notInstalled = React.useMemo(() => 
    state.voiceList?.filter(x => x.installState != "installed" && isLanguageAllowed(x)) ?? [], 
    [state.voiceList]
  )
  const advertised = React.useMemo(() => makeAdvertisedVoiceList(state.voiceList), [state.voiceList])

  // Group voices by country
  const groupVoicesByCountry = (voices: MyVoice[]) => {
    const grouped: Record<string, MyVoice[]> = {}
    voices.forEach(voice => {
      const country = voice.language.country_english || 'Other'
      if (!grouped[country]) grouped[country] = []
      grouped[country].push(voice)
    })
    return grouped
  }

  const installedByCountry = React.useMemo(() => 
    state.selectedCountry 
      ? groupVoicesByCountry(installed.filter(v => v.language.country_english === state.selectedCountry))
      : groupVoicesByCountry(installed),
    [installed, state.selectedCountry]
  )

  const notInstalledByCountry = React.useMemo(() => 
    state.selectedCountry 
      ? groupVoicesByCountry(notInstalled.filter(v => v.language.country_english === state.selectedCountry))
      : groupVoicesByCountry(notInstalled),
    [notInstalled, state.selectedCountry]
  )

  // Get unique countries from all voices
  const availableCountries = React.useMemo(() => {
    const allVoices = [...installed, ...notInstalled]
    const countries = new Set(allVoices.map(v => v.language.country_english))
    return Array.from(countries).sort()
  }, [installed, notInstalled])


  //startup
  React.useEffect(() => {
    getVoiceList()
      .then(voiceList => stateUpdater(draft => {
        draft.voiceList = voiceList
      }))
      .catch(reportError)
    getPopularity()
      .then(popularity => stateUpdater(draft => {
        draft.popularity = popularity
      }))
      .catch(console.error)
    
    // Load stored URL conversions
    loadStoredConversions()
  }, [])

  async function loadStoredConversions() {
    try {
      const stored = await storage.getFile("url-conversions.json")
        .then(blob => blob.text())
        .then(JSON.parse)
        .catch(() => [])
      stateUpdater(draft => {
        draft.urlConversions = stored
      })
    } catch (err) {
      console.error("Failed to load stored conversions:", err)
    }
  }

  async function saveConversions(conversions: typeof state.urlConversions) {
    try {
      const toSave = conversions.map(({id, url, title, text, voiceName, createdAt}) => ({
        id, url, title, text, voiceName, createdAt
      }))
      await storage.putFile("url-conversions.json", new Blob([JSON.stringify(toSave)], {type: "application/json"}))
    } catch (err) {
      console.error("Failed to save conversions:", err)
    }
  }

  async function getConversionAudio(id: string): Promise<Blob | null> {
    try {
      return await storage.getFile(`url-conversion-${id}.wav`)
    } catch {
      return null
    }
  }

  async function saveConversionAudio(id: string, blob: Blob) {
    try {
      await storage.putFile(`url-conversion-${id}.wav`, blob)
    } catch (err) {
      console.error("Failed to save conversion audio:", err)
    }
  }

  //advertise voices
  React.useEffect(() => {
    if (advertised) advertiseVoices(advertised)
  }, [
    advertised
  ])

  //handle requests
  React.useEffect(() => {
    messageDispatcher.updateHandlers({
      speak: onSpeak,
      synthesize: onSynthesize,
      pause: onPause,
      resume: onResume,
      stop: onStop,
      forward: onForward,
      rewind: onRewind,
      seek: onSeek,
    })
  })

  //auto-scroll activity log
  React.useEffect(() => {
    refs.activityLog.current.scrollTop = refs.activityLog.current.scrollHeight
  }, [
    state.activityLog
  ])


  return (
    <div className="container">
      <div className="text-end text-muted small mt-1 mb-4">
        <span className="link"
          onClick={() => stateUpdater(draft => {draft.showInfoBox = true})}>
          💡 What is Piper?
        </span>
      </div>

      {(query.has("showTest") ? query.get("showTest") != "0" : top == self) &&
        <div className="test-section">
          <h2>🎤 Test Voice</h2>
          <form>
            <textarea className="form-control" rows={4} name="text" defaultValue={config.testSpeech} 
              placeholder="Type or paste text here to test the voice synthesis..." />
            <select className="form-control mt-3" name="voice">
              <option value="">🎯 Select a voice...</option>
              {advertised?.map(voice =>
                <option key={voice.voiceName} value={voice.voiceName}>{voice.voiceName}</option>
              )}
            </select>
            <div className="d-flex align-items-center mt-3 flex-wrap gap-2">
              {state.test.current == null &&
                <button type="button" className="btn btn-primary" onClick={onTestSpeak}>
                  🔊 Speak
                </button>
              }
              {state.test.current?.type == "speaking" &&
                <>
                  <button type="button" className="btn btn-primary" disabled>
                    ⏳ Speaking...
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => stateUpdater(draft => { draft.readingView.show = !draft.readingView.show })}
                  >
                    {state.readingView.show ? "📖 Hide Reading View" : "📖 Show Reading View"}
                  </button>
                </>
              }
              {location.hostname == "localhost" && state.test.current?.type == "speaking" &&
                <>
                  <button type="button" className="btn btn-secondary" onClick={onPause}>⏸️ Pause</button>
                  <button type="button" className="btn btn-secondary" onClick={onResume}>▶️ Resume</button>
                  <button type="button" className="btn btn-secondary" onClick={onForward}>⏩ Forward</button>
                  <button type="button" className="btn btn-secondary" onClick={onRewind}>⏪ Rewind</button>
                  <button type="button" className="btn btn-secondary"
                    onClick={() => onSeek({index: Number(prompt())})}>🎯 Seek</button>
                </>
              }
              {state.test.current == null &&
                <button type="button" className="btn btn-secondary" onClick={onTestSynthesize}>
                  ⬇️ Download Audio
                </button>
              }
              {state.test.current?.type == "synthesizing" &&
                <button type="button" className="btn btn-secondary" disabled>
                  ⏳ {state.test.current.percent}%
                </button>
              }
              {state.test.current &&
                <button type="button" className="btn btn-danger" onClick={onStopTest}>
                  ⏹️ Stop
                </button>
              }
              {state.test.downloadUrl &&
                <audio src={state.test.downloadUrl} controls className="ms-1" />
              }
            </div>
          </form>
        </div>
      }

      <div className="url-conversion-section" style={{
        background: "linear-gradient(135deg, rgba(79, 172, 254, 0.1) 0%, rgba(0, 242, 254, 0.1) 100%)",
        borderRadius: "16px",
        padding: "2rem",
        border: "2px solid rgba(79, 172, 254, 0.2)",
        marginBottom: "2rem"
      }}>
        <h2>🌐 Convert URL to Speech</h2>
        <form onSubmit={onConvertUrl}>
          <div className="mb-3">
            <label className="form-label">Enter URL:</label>
            <input 
              type="url" 
              className="form-control" 
              name="url" 
              value={state.urlConversion.url}
              onChange={(e) => stateUpdater(draft => { draft.urlConversion.url = e.target.value })}
              placeholder="https://example.com/article" 
              required 
              disabled={state.urlConversion.loading}
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Select Voice:</label>
            <select className="form-control" name="urlVoice" required disabled={state.urlConversion.loading}>
              <option value="">🎯 Select a voice...</option>
              {advertised?.map(voice =>
                <option key={voice.voiceName} value={voice.voiceName}>{voice.voiceName}</option>
              )}
            </select>
          </div>
          {state.urlConversion.error && (
            <div className="alert alert-danger" role="alert">
              {state.urlConversion.error}
            </div>
          )}
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={state.urlConversion.loading}
          >
            {state.urlConversion.loading ? "⏳ Converting..." : "🔊 Convert to Speech"}
          </button>
        </form>
      </div>

      {state.urlConversions.length > 0 && (
        <div className="stored-conversions-section" style={{
          background: "linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)",
          borderRadius: "16px",
          padding: "2rem",
          border: "2px solid rgba(102, 126, 234, 0.2)",
          marginBottom: "2rem"
        }}>
          <h2>💾 Stored URL Conversions ({state.urlConversions.length})</h2>
          <div style={{display: "flex", flexDirection: "column", gap: "1rem"}}>
            {state.urlConversions.map(conversion => (
              <div key={conversion.id} style={{
                background: "white",
                padding: "1rem",
                borderRadius: "12px",
                border: "1px solid rgba(102, 126, 234, 0.2)"
              }}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem"}}>
                  <div style={{flex: "1", minWidth: "200px"}}>
                    <h4 style={{margin: "0 0 0.5rem 0", fontSize: "1.1rem"}}>{conversion.title}</h4>
                    <div style={{fontSize: "0.9rem", color: "#6c757d", marginBottom: "0.5rem"}}>
                      <a href={conversion.url} target="_blank" rel="noopener noreferrer" style={{color: "#667eea"}}>
                        {conversion.url}
                      </a>
                    </div>
                    <div style={{fontSize: "0.85rem", color: "#6c757d"}}>
                      Voice: {conversion.voiceName}
                    </div>
                    <div style={{fontSize: "0.85rem", color: "#6c757d"}}>
                      {new Date(conversion.createdAt).toLocaleString()}
                    </div>
                    <div style={{marginTop: "0.5rem", fontSize: "0.9rem", maxHeight: "100px", overflow: "auto"}}>
                      {conversion.text.substring(0, 200)}...
                    </div>
                  </div>
                  <div style={{display: "flex", gap: "0.5rem", flexWrap: "wrap"}}>
                    <button 
                      type="button" 
                      className="btn btn-primary btn-sm" 
                      onClick={() => onPlayConversion(conversion)}
                    >
                      ▶️ Play
                    </button>
                    {state.readingView.text === conversion.text && (
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm" 
                        onClick={() => stateUpdater(draft => { draft.readingView.show = !draft.readingView.show })}
                      >
                        {state.readingView.show ? "📖 Hide Reading View" : "📖 Show Reading View"}
                      </button>
                    )}
                    <button 
                      type="button" 
                      className="btn btn-danger btn-sm" 
                      onClick={() => onDeleteConversion(conversion.id)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="activity-log-section">
        <h2>📋 Activity Log</h2>
        <textarea className="form-control" disabled rows={5} ref={refs.activityLog} value={state.activityLog} 
          placeholder="Activity logs will appear here..." />
      </div>

      <div>
        <div className="section-header">
          <h2 style={{cursor: "pointer", margin: 0}} onClick={() => toggleSection('installed')}>
            ✅ Installed Voices
            <span style={{fontSize: "1rem", marginLeft: "0.5rem"}}>
              {state.sectionsCollapsed.installed ? '▼' : '▲'}
            </span>
          </h2>
          {installed.length > 0 && (
            <span className="badge-modern">{installed.length} voice{installed.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        {!state.sectionsCollapsed.installed && (
          <>
            {installed.length == 0 &&
              <div className="empty-state">
                <div style={{fontSize: "3rem", marginBottom: "1rem"}}>🎙️</div>
                <div>No voices installed yet. Install some voices below to get started!</div>
              </div>
            }
            {installed.length > 0 && availableCountries.length > 1 && (
              <div style={{marginBottom: "1rem"}}>
                <label className="form-label">🌍 Filter by Country:</label>
                <select 
                  className="form-control" 
                  value={state.selectedCountry || ""} 
                  onChange={(e) => stateUpdater(draft => { draft.selectedCountry = e.target.value || null })}
                  style={{maxWidth: "300px"}}
                >
                  <option value="">All Countries</option>
                  {availableCountries.map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
              </div>
            )}
            {installed.length > 0 && Object.keys(installedByCountry).length > 0 && (
              <div className="voice-dropdowns">
                {Object.entries(installedByCountry).map(([country, voices]) => (
                  <div key={country} className="country-group" style={{marginBottom: "1.5rem"}}>
                    <h3 style={{fontSize: "1.25rem", marginBottom: "0.75rem", color: "#667eea"}}>
                      {country} ({voices.length} voice{voices.length !== 1 ? 's' : ''})
                    </h3>
                    {voices.map(voice => (
                      <div key={voice.key} className="voice-item" style={{
                        padding: "1rem",
                        marginBottom: "0.75rem",
                        background: "rgba(102, 126, 234, 0.05)",
                        borderRadius: "12px",
                        border: "1px solid rgba(102, 126, 234, 0.2)"
                      }}>
                        <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem"}}>
                          <div style={{flex: "1", minWidth: "200px"}}>
                            <div className="voice-name">{voice.name}</div>
                            <span className="quality-badge">{voice.quality}</span>
                            <div style={{marginTop: "0.5rem", fontSize: "0.9rem"}}>
                              <strong>{voice.language.name_native}</strong>
                            </div>
                            <div style={{display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap"}}>
                              {voice.num_speakers <= 1 ? (
                                <>
                                  {state.playingSample?.voiceKey === voice.key && !state.playingSample?.speakerId ? (
                                    <button type="button" className="btn btn-danger btn-sm" onClick={onStopSample}>
                                      ⏹️ Stop Sample
                                    </button>
                                  ) : (
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPlaySample(voice)}>
                                      🎵 Sample
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="link" style={{cursor: "pointer"}}
                                    onClick={() => toggleExpanded(voice.key)}>
                                    👥 {voice.num_speakers} voices {state.isExpanded[voice.key] ? '▲' : '▼'}
                                  </span>
                                  {state.isExpanded[voice.key] && (
                                    <ul style={{marginTop: "0.5rem", paddingLeft: "1.5rem", width: "100%"}}>
                                      {Object.entries(voice.speaker_id_map).map(([speakerName, speakerId]) =>
                                        <li key={speakerId} style={{marginBottom: "0.25rem", display: "flex", gap: "0.5rem", alignItems: "center"}}>
                                          <span>{speakerName}</span>
                                          {state.playingSample?.voiceKey === voice.key && state.playingSample?.speakerId === speakerId ? (
                                            <button type="button" className="btn btn-danger btn-sm" onClick={onStopSample}>
                                              ⏹️ Stop
                                            </button>
                                          ) : (
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPlaySample(voice, speakerId)}>
                                              🎵 Sample
                                            </button>
                                          )}
                                        </li>
                                      )}
                                    </ul>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div style={{display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap"}}>
                            <div style={{textAlign: "right"}}>
                              {immediate(() => {
                                if (voice.numActiveUsers) return <span className="status-badge status-in-use">🟢 In Use</span>
                                switch (voice.loadState) {
                                  case "not-loaded": return <span className="status-badge status-on-disk">💾 On Disk</span>
                                  case "loading": return <span className="status-badge status-loading">⏳ Loading...</span>
                                  case "loaded": return <span className="status-badge status-in-memory">⚡ In Memory</span>
                                }
                              })}
                              <div style={{marginTop: "0.5rem"}}>
                                <strong>{(voice.modelFileSize /1e6).toFixed(1)} MB</strong>
                              </div>
                            </div>
                            <button type="button" className="btn btn-danger btn-sm"
                              onClick={() => onDelete(voice.key)}>
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <div className="section-header">
          <h2 style={{cursor: "pointer", margin: 0}} onClick={() => toggleSection('available')}>
            📦 Available to Install
            <span style={{fontSize: "1rem", marginLeft: "0.5rem"}}>
              {state.sectionsCollapsed.available ? '▼' : '▲'}
            </span>
          </h2>
          {notInstalled.length > 0 && (
            <span className="badge-modern">{notInstalled.length} voice{notInstalled.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        {!state.sectionsCollapsed.available && (
          <>
            {notInstalled.length > 0 && availableCountries.length > 1 && (
              <div style={{marginBottom: "1rem"}}>
                <label className="form-label">🌍 Filter by Country:</label>
                <select 
                  className="form-control" 
                  value={state.selectedCountry || ""} 
                  onChange={(e) => stateUpdater(draft => { draft.selectedCountry = e.target.value || null })}
                  style={{maxWidth: "300px"}}
                >
                  <option value="">All Countries</option>
                  {availableCountries.map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
              </div>
            )}
            {notInstalled.length > 0 && Object.keys(notInstalledByCountry).length > 0 && (
              <div className="voice-dropdowns">
                {Object.entries(notInstalledByCountry).map(([country, voices]) => (
                  <div key={country} className="country-group" style={{marginBottom: "1.5rem"}}>
                    <h3 style={{fontSize: "1.25rem", marginBottom: "0.75rem", color: "#667eea"}}>
                      {country} ({voices.length} voice{voices.length !== 1 ? 's' : ''})
                    </h3>
                    {voices.map(voice => (
                      <div key={voice.key} className="voice-item" style={{
                        padding: "1rem",
                        marginBottom: "0.75rem",
                        background: "rgba(102, 126, 234, 0.05)",
                        borderRadius: "12px",
                        border: "1px solid rgba(102, 126, 234, 0.2)"
                      }}>
                        <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem"}}>
                          <div style={{flex: "1", minWidth: "200px"}}>
                            <div className="voice-name">{voice.name}</div>
                            <span className="quality-badge">{voice.quality}</span>
                            <div style={{marginTop: "0.5rem", fontSize: "0.9rem"}}>
                              <strong>{voice.language.name_native}</strong>
                            </div>
                            <div style={{display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap"}}>
                              {voice.num_speakers <= 1 ? (
                                <>
                                  {state.playingSample?.voiceKey === voice.key && !state.playingSample?.speakerId ? (
                                    <button type="button" className="btn btn-danger btn-sm" onClick={onStopSample}>
                                      ⏹️ Stop Sample
                                    </button>
                                  ) : (
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPlaySample(voice)}>
                                      🎵 Sample
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="link" style={{cursor: "pointer"}}
                                    onClick={() => toggleExpanded(voice.key)}>
                                    👥 {voice.num_speakers} voices {state.isExpanded[voice.key] ? '▲' : '▼'}
                                  </span>
                                  {state.isExpanded[voice.key] && (
                                    <ul style={{marginTop: "0.5rem", paddingLeft: "1.5rem", width: "100%"}}>
                                      {voice.speakerList.map(({speakerName, speakerId}) =>
                                        <li key={speakerName} style={{marginBottom: "0.25rem", display: "flex", gap: "0.5rem", alignItems: "center"}}>
                                          <span>{speakerName}</span>
                                          {state.playingSample?.voiceKey === voice.key && state.playingSample?.speakerId === speakerId ? (
                                            <button type="button" className="btn btn-danger btn-sm" onClick={onStopSample}>
                                              ⏹️ Stop
                                            </button>
                                          ) : (
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPlaySample(voice, speakerId)}>
                                              🎵 Sample
                                            </button>
                                          )}
                                        </li>
                                      )}
                                    </ul>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div style={{display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap"}}>
                            <div style={{textAlign: "right"}}>
                              <div>
                                {state.popularity[voice.key] ? (
                                  <span>
                                    {Array(Math.min(5, Math.floor(state.popularity[voice.key]! / 1000))).fill(0).map((_, i) => (
                                      <span key={i} className="popularity-star">⭐</span>
                                    ))}
                                    <span className="text-muted small ms-1">({state.popularity[voice.key]})</span>
                                  </span>
                                ) : "\u00A0"}
                              </div>
                              <div style={{marginTop: "0.5rem"}}>
                                <strong>{(voice.modelFileSize /1e6).toFixed(1)} MB</strong>
                              </div>
                            </div>
                            <InstallButton voice={voice} onInstall={onInstall} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="footer-links">
        <a target="_blank" href="https://github.com/ai-fanatic/funpiper-tts" className="muted-link">
          <svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 240 240" preserveAspectRatio="xMidYMid meet" style={{verticalAlign: "middle", marginRight: "0.25rem"}}>
            <g transform="translate(0, 240) scale(0.1, -0.1)" fill="#667eea" stroke="none">
              <path d="M970 2301 c-305 -68 -555 -237 -727 -493 -301 -451 -241 -1056 143 -1442 115 -116 290 -228 422 -271 49 -16 55 -16 77 -1 24 16 25 20 25 135 l0 118 -88 -5 c-103 -5 -183 13 -231 54 -17 14 -50 62 -73 106 -38 74 -66 108 -144 177 -26 23 -27 24 -9 37 43 32 130 1 185 -65 96 -117 133 -148 188 -160 49 -10 94 -6 162 14 9 3 21 24 27 48 6 23 22 58 35 77 l24 35 -81 16 c-170 35 -275 96 -344 200 -64 96 -85 179 -86 334 0 146 16 206 79 288 28 36 31 47 23 68 -15 36 -11 188 5 234 13 34 20 40 47 43 45 5 129 -24 214 -72 l73 -42 64 15 c91 21 364 20 446 0 l62 -16 58 35 c77 46 175 82 224 82 39 0 39 -1 55 -52 17 -59 20 -166 5 -217 -8 -30 -6 -39 16 -68 109 -144 121 -383 29 -579 -62 -129 -193 -219 -369 -252 l-84 -16 31 -55 32 -56 3 -223 4 -223 25 -16 c23 -15 28 -15 76 2 80 27 217 101 292 158 446 334 590 933 343 1431 -145 293 -419 518 -733 602 -137 36 -395 44 -525 15z" />
            </g>
          </svg>
          GitHub
        </a>
        <span className="text-muted">•</span>
        <a target="_blank" href="https://naveen.aifanatic.pro/" className="muted-link">Portfolio</a>
        <span className="text-muted">•</span>
        <a href="/terms.html" className="muted-link">Terms of Service</a>
        <span className="text-muted">•</span>
        <a href="/privacy.html" className="muted-link">Privacy Policy</a>
      </div>

      {state.readingView.show && state.readingView.text && (
        <div className="modal d-block" style={{backgroundColor: "rgba(0,0,0,.8)", backdropFilter: "blur(5px)"}} tabIndex={-1}
          onClick={e => e.target == e.currentTarget && stateUpdater(draft => {draft.readingView.show = false})}>
          <div className="modal-dialog modal-dialog-centered modal-lg" style={{maxWidth: "90%"}}>
            <div className="modal-content" style={{maxHeight: "90vh", display: "flex", flexDirection: "column"}}>
              <div className="modal-header" style={{background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white"}}>
                <h5 className="modal-title">📖 Reading View</h5>
                <button type="button" className="btn-close btn-close-white" aria-label="Close"
                  onClick={() => stateUpdater(draft => {draft.readingView.show = false})}></button>
              </div>
              <div className="modal-body" style={{
                overflowY: "auto",
                fontSize: "1.2rem",
                lineHeight: "1.8",
                padding: "2rem",
                background: "#f8f9fa"
              }}>
                <ReadingViewText 
                  text={state.readingView.text}
                  currentStart={state.readingView.currentSentenceStart}
                  currentEnd={state.readingView.currentSentenceEnd}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {state.showInfoBox &&
        <div className="modal d-block" style={{backgroundColor: "rgba(0,0,0,.6)", backdropFilter: "blur(5px)"}} tabIndex={-1} aria-hidden="true"
          onClick={e => e.target == e.currentTarget && stateUpdater(draft => {draft.showInfoBox = false})}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">💡 What is Piper?</h5>
                <button type="button" className="btn-close" aria-label="Close"
                  onClick={() => stateUpdater(draft => {draft.showInfoBox = false})}></button>
              </div>
              <div className="modal-body">
                <p>
                  Piper is a collection of high-quality, open-source text-to-speech voices developed by
                  the <a target="_blank" href="https://github.com/rhasspy/piper">Piper Project</a>,
                  powered by machine learning technology.
                  These voices are synthesized in-browser, requiring no cloud subscriptions, and are entirely
                  free to use.
                  You can use them to read aloud web pages and documents with
                  the <a target="_blank" href="https://readaloud.app">Read Aloud</a> extension,
                  or make them generally available to all browser apps through
                  the <a target="_blank" href="https://ttstool.com/redirect.html?target=piper-tts-extension">Piper TTS</a> extension.
                </p>
                <p>
                  Each of the voice packs is a machine learning model capable of synthesizing one or more
                  distinct voices.  Each pack must be separately installed.
                  Due to the substantial size of these voice packs, it is advisable to install only those
                  that you intend to use.
                  To assist in your selection, you can refer to the "Popularity" ranking, which indicates the
                  preferred choices among users.
                </p>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  )


  //controllers

  function reportError(err: unknown) {
    if (err instanceof Error) {
      console.error(err)
      appendActivityLog(String(err))
    }
    else {
      appendActivityLog(JSON.stringify(err))
    }
  }

  function appendActivityLog(text: string) {
    stateUpdater(draft => {
      draft.activityLog += text + '\n'
    })
  }

  function toggleExpanded(voiceKey: string) {
    stateUpdater(draft => {
      draft.isExpanded[voiceKey] = !draft.isExpanded[voiceKey]
    })
  }

  function toggleSection(section: 'installed' | 'available') {
    stateUpdater(draft => {
      draft.sectionsCollapsed[section] = !draft.sectionsCollapsed[section]
    })
  }

  function onPlaySample(voice: MyVoice, speakerId?: number) {
    // Stop any currently playing sample
    if (state.playingSample) {
      sampler.stop()
    }
    sampler.play(voice, speakerId)
    stateUpdater(draft => {
      draft.playingSample = {voiceKey: voice.key, speakerId}
    })
    
    // Clear playing state when audio ends
    const audio = (sampler as any).audio as HTMLAudioElement
    if (audio) {
      const handleEnded = () => {
        stateUpdater(draft => {
          if (draft.playingSample?.voiceKey === voice.key && draft.playingSample?.speakerId === speakerId) {
            draft.playingSample = null
          }
        })
        audio.removeEventListener('ended', handleEnded)
      }
      audio.addEventListener('ended', handleEnded)
    }
  }

  function onStopSample() {
    sampler.stop()
    const audio = (sampler as any).audio as HTMLAudioElement
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    stateUpdater(draft => {
      draft.playingSample = null
    })
  }

  async function onInstall(voice: MyVoice, onProgress: (percent: number) => void) {
    storage.requestPersistence()
      .then(granted => console.info("Persistent storage:", granted))
      .catch(console.error)
    try {
      stateUpdater(draft => {
        draft.voiceList!.find(x => x.key == voice.key)!.installState = "installing"
      })
      const {model, modelConfig} = await installVoice(voice, onProgress)
      stateUpdater(draft => {
        draft.voiceList!.find(x => x.key == voice.key)!.installState = "installed"
      })
    }
    catch (err) {
      reportError(err)
    }
  }

  async function onDelete(voiceKey: string) {
    if (!confirm("Are you sure you want to uninstall this voice?")) return;
    try {
      synthesizers.get(voiceKey)?.dispose()
      synthesizers.delete(voiceKey)
      await deleteVoice(voiceKey)
      stateUpdater(draft => {
        const voiceDraft = draft.voiceList!.find(x => x.key == voiceKey)!
        voiceDraft.loadState = "not-loaded"
        voiceDraft.installState = "not-installed"
      })
    }
    catch (err) {
      reportError(err)
    }
  }

  function onSpeak(
    {utterance, voiceName, pitch, rate, volume, externalPlayback}: Record<string, unknown>,
    sender: {send(message: unknown): void}
  ) {
    if (!(
      typeof utterance == "string" &&
      typeof voiceName == "string" &&
      (typeof pitch == "number" || typeof pitch == "undefined") &&
      (typeof rate == "number" || typeof rate == "undefined") &&
      (typeof volume == "number" || typeof volume == "undefined") &&
      (typeof externalPlayback == "boolean" || typeof externalPlayback == "undefined")
    )) {
      throw new Error("Bad args")
    }
    speak({
      text: utterance,
      voiceName,
      playAudio(pcmData, appendSilenceSeconds) {
        if (externalPlayback) {
          const wav = makeWav([{pcmData, appendSilenceSeconds}])
          const id = String(Math.random())
          sender.send({to: "piper-host", type: "request", id, method: "audioPlay", args: {src: wav, rate, volume}})
          const playing = {
            completePromise: messageDispatcher.waitForResponse<void>(id),
            pause() {
              sender.send({to:"piper-host", type: "notification", method: "audioPause"})
              return {
                resume() {
                  sender.send({to: "piper-host", type: "notification", method: "audioResume"})
                  return playing
                }
              }
            }
          }
          return playing
        } else {
          return playAudio(pcmData, appendSilenceSeconds, pitch, rate, volume)
        }
      },
      callback(method, args) {
        sender.send({to: "piper-host", type: "notification", method, args})
      }
    })
  }

  function onSynthesize(
    {text, voiceName, pitch}: Record<string, unknown>,
    sender: {send(message: unknown): void}
  ) {
    if (!(
      typeof text == "string" &&
      typeof voiceName == "string" &&
      (typeof pitch == "number" || typeof pitch == "undefined")
    )) {
      throw new Error("Bad args")
    }
    const chunks = [] as Array<{pcmData: PcmData, appendSilenceSeconds: number}>
    speak({
      text,
      voiceName,
      playAudio(pcmData, appendSilenceSeconds) {
        chunks.push({pcmData, appendSilenceSeconds})
        const playing = {
          completePromise: Promise.resolve(),
          pause: () => ({resume: () => playing})
        }
        return playing
      },
      callback(method, args) {
        if (method == "onEnd") args = {...args, audioBlob: makeWav(chunks)}
        sender.send({to: "piper-host", type: "notification", method, args})
      }
    })
  }

  function speak({text, voiceName, playAudio, callback}: {
    text: string,
    voiceName: string,
    playAudio: PlayAudio,
    callback(method: string, args?: Record<string, unknown>): void
  }) {
    const {modelId, speakerName} = parseAdvertisedVoiceName(voiceName)
    const voice = state.voiceList!.find(({key}) => key.endsWith('-' + modelId))
    if (!voice) throw new Error("Voice not found")

    const speakerId = immediate(() => {
      if (speakerName) {
        if (!(speakerName in voice.speaker_id_map)) throw new Error("Speaker name not found")
        return voice.speaker_id_map[speakerName]
      }
    })

    appendActivityLog(`Synthesizing '${text.slice(0,50).replace(/\s+/g,' ')}...' using ${voice.name} [${voice.quality}] ${speakerName ?? ''}`)

    const synth = synthesizers.get(voice.key) ?? immediate(() => {
      appendActivityLog(`Initializing ${voice.name} [${voice.quality}], please wait...`)
      const tmp = makeSynthesizer(voice.key)
      synthesizers.set(voice.key, tmp)
      return tmp
    })

    currentSpeech?.cancel()
    // Set reading view text when speech starts
    stateUpdater(draft => {
      if (!draft.readingView.text) {
        draft.readingView.text = text
      }
    })
    
    const speech = currentSpeech = makeSpeech(synth, {speakerId, text, playAudio}, {
      onSentence(startIndex, endIndex) {
        notifyCaller("onSentence", {startIndex, endIndex})
      }
    })
    function notifyCaller(method: string, args?: Record<string, unknown>) {
      if (speech == currentSpeech) {
        callback(method, args)
        // Update reading view state
        if (method === "onStart") {
          stateUpdater(draft => {
            draft.readingView.sentenceStartIndicies = (args?.sentenceStartIndicies as number[]) || []
            // Ensure text is set if not already
            if (!draft.readingView.text) {
              draft.readingView.text = text
            }
          })
        } else if (method === "onSentence") {
          stateUpdater(draft => {
            if (draft.readingView.show) {
              draft.readingView.currentSentenceStart = (args?.startIndex as number) ?? -1
              draft.readingView.currentSentenceEnd = (args?.endIndex as number) ?? -1
            }
          })
        } else if (method === "onEnd") {
          stateUpdater(draft => {
            draft.readingView.currentSentenceStart = -1
            draft.readingView.currentSentenceEnd = -1
          })
        }
      }
    }

    immediate(async () => {
      try {
        try {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key == voice.key)!.loadState = "loading"
          })
          await synth.readyPromise
        }
        finally {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key == voice.key)!.loadState = "loaded"
          })
        }

        const start = Date.now()
        try {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key == voice.key)!.numActiveUsers++
          })
          notifyCaller("onStart", {sentenceStartIndicies: speech.sentenceStartIndicies})
          await speech.play()
          notifyCaller("onEnd")
        }
        finally {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key == voice.key)!.numActiveUsers--
          })
          const duration = Date.now() - start
          updateStats(stats => {
            if (!stats.voiceUsage) stats.voiceUsage = {}
            const hashKey = voice.key + (speakerName ?? "")
            stats.voiceUsage[hashKey] = (stats.voiceUsage[hashKey] ?? 0) + duration
          })
        }
      }
      catch (err: any) {
        if (err.name != "CancellationException") {
          reportError(err)
          notifyCaller("onError", {error: err})
        }
      }
      finally {
        if (currentSpeech == speech) currentSpeech = undefined
      }
    })
  }

  function onPause() {
    currentSpeech?.pause()
  }

  function onResume() {
    currentSpeech?.resume()
  }

  function onStop() {
    currentSpeech?.cancel()
    currentSpeech = undefined
  }

  function onForward() {
    currentSpeech?.forward()
  }

  function onRewind() {
    currentSpeech?.rewind()
  }

  function onSeek({index}: Record<string, unknown>) {
    if (typeof index != "number") throw new Error("Bad args")
    currentSpeech?.seek(index)
  }

  function onTestSpeak(event: React.MouseEvent<HTMLButtonElement>) {
    const form = (event.target as HTMLButtonElement).form
    if (form?.text.value && form.voice.value) {
      if (state.test.downloadUrl) URL.revokeObjectURL(state.test.downloadUrl)
      const text = form.text.value
      stateUpdater(draft => {
        draft.test.downloadUrl = null
        draft.test.current = {type: "speaking"}
        draft.readingView.text = text
        draft.readingView.currentSentenceStart = -1
        draft.readingView.currentSentenceEnd = -1
      })
      onSpeak({utterance: text, voiceName: form.voice.value}, {
        send({method, args}: {method: string, args?: Record<string, unknown>}) {
          console.log(method, args)
          if (method == "onStart") {
            stateUpdater(draft => {
              draft.readingView.sentenceStartIndicies = (args?.sentenceStartIndicies as number[]) || []
            })
          } else if (method == "onEnd") {
            stateUpdater(draft => {
              draft.test.current = null
              draft.readingView.currentSentenceStart = -1
              draft.readingView.currentSentenceEnd = -1
            })
          } else if (method == "onSentence") {
            stateUpdater(draft => {
              draft.readingView.currentSentenceStart = (args?.startIndex as number) ?? -1
              draft.readingView.currentSentenceEnd = (args?.endIndex as number) ?? -1
            })
          }
        }
      })
    }
  }

  function onTestSynthesize(event: React.MouseEvent<HTMLButtonElement>) {
    const form = (event.target as HTMLButtonElement).form!
    const text = form.text.value
    const voiceName = form.voice.value
    if (text && voiceName) {
      if (state.test.downloadUrl) URL.revokeObjectURL(state.test.downloadUrl)
      stateUpdater(draft => {
        draft.test.downloadUrl = null
        draft.test.current = {type: "synthesizing", percent: 0}
      })
      onSynthesize({text, voiceName}, {
        send({method, args}: {method: string, args?: Record<string, unknown>}) {
          console.log(method, args)
          if (method == "onEnd") {
            stateUpdater(draft => {
              draft.test.current = null
              if (args?.audioBlob instanceof Blob) draft.test.downloadUrl = URL.createObjectURL(args.audioBlob)
            })
          }
          else if (method == "onSentence") {
            stateUpdater(draft => {
              if (draft.test.current?.type == "synthesizing" && typeof args?.startIndex == "number")
                draft.test.current.percent = Math.round(100 * args.startIndex / text.length)
            })
          }
        }
      })
    }
  }

  function onStopTest() {
    onStop()
    stateUpdater(draft => {
      draft.test.current = null
    })
  }

  async function onConvertUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const url = (form.querySelector('[name="url"]') as HTMLInputElement)?.value
    const voiceName = (form.querySelector('[name="urlVoice"]') as HTMLSelectElement)?.value
    
    if (!url || !voiceName) {
      stateUpdater(draft => {
        draft.urlConversion.error = "Please provide both URL and voice"
      })
      return
    }

    stateUpdater(draft => {
      draft.urlConversion.loading = true
      draft.urlConversion.error = null
    })

    try {
      // Fetch URL content (using CORS proxy or direct fetch)
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
      if (!response.ok) throw new Error("Failed to fetch URL")
      
      const data = await response.json()
      const htmlContent = data.contents
      
      // Extract text from HTML
      const parser = new DOMParser()
      const doc = parser.parseFromString(htmlContent, 'text/html')
      
      // Remove script and style elements
      const scripts = doc.querySelectorAll('script, style, nav, header, footer, aside')
      scripts.forEach(el => el.remove())
      
      // Get text content
      const title = doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || 'Untitled'
      const textContent = doc.body.textContent || doc.body.innerText || ''
      const cleanText = textContent.replace(/\s+/g, ' ').trim().substring(0, 5000) // Limit to 5000 chars
      
      if (!cleanText) {
        throw new Error("No text content found on the page")
      }

      // Synthesize speech
      const chunks: Array<{pcmData: PcmData, appendSilenceSeconds: number}> = []
      let resolvePromise: () => void = () => {}
      let rejectPromise: (err: Error) => void = () => {}
      const synthesisPromise = new Promise<void>((resolve, reject) => {
        resolvePromise = resolve
        rejectPromise = reject
      })
      
      const playingObj: AudioPlaying = {
        completePromise: Promise.resolve(),
        pause() {
          return {
            resume() {
              return playingObj
            }
          }
        }
      }
      
      speak({
        text: cleanText,
        voiceName,
        playAudio(pcmData, appendSilenceSeconds): AudioPlaying {
          chunks.push({pcmData, appendSilenceSeconds})
          return playingObj
        },
        callback(method, args) {
          if (method === "onEnd") {
            resolvePromise()
          } else if (method === "onError") {
            rejectPromise(new Error(String(args?.error)))
          }
        }
      })
      
      await synthesisPromise

      const audioBlob = makeWav(chunks)
      const conversionId = String(Date.now())
      const conversion = {
        id: conversionId,
        url,
        title: title.substring(0, 100),
        text: cleanText,
        voiceName,
        createdAt: Date.now()
      }

      const updatedConversions = [...state.urlConversions, conversion]
      stateUpdater(draft => {
        draft.urlConversions = updatedConversions
        draft.urlConversion.loading = false
        draft.urlConversion.url = ""
        draft.readingView.text = cleanText
        draft.readingView.currentSentenceStart = -1
        draft.readingView.currentSentenceEnd = -1
      })
      
      await Promise.all([
        saveConversions(updatedConversions),
        saveConversionAudio(conversionId, audioBlob)
      ])
      appendActivityLog(`URL converted to speech: ${url}`)
    } catch (err) {
      reportError(err)
      stateUpdater(draft => {
        draft.urlConversion.loading = false
        draft.urlConversion.error = err instanceof Error ? err.message : "Failed to convert URL"
      })
    }
  }

  async function onDeleteConversion(id: string) {
    const updatedConversions = state.urlConversions.filter(c => c.id !== id)
    stateUpdater(draft => {
      draft.urlConversions = updatedConversions
    })
    await Promise.all([
      saveConversions(updatedConversions),
      storage.deleteFile(`url-conversion-${id}.wav`).catch(() => {})
    ])
    appendActivityLog(`Deleted URL conversion: ${id}`)
  }

  async function onPlayConversion(conversion: typeof state.urlConversions[0]) {
    const audioBlob = await getConversionAudio(conversion.id)
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob)
      const audio = new Audio(url)
      stateUpdater(draft => {
        draft.readingView.text = conversion.text
        draft.readingView.currentSentenceStart = -1
        draft.readingView.currentSentenceEnd = -1
      })
      audio.play()
      audio.onended = () => {
        URL.revokeObjectURL(url)
        stateUpdater(draft => {
          draft.readingView.currentSentenceStart = -1
          draft.readingView.currentSentenceEnd = -1
        })
      }
    } else {
      // Re-synthesize if blob not available
      stateUpdater(draft => {
        draft.readingView.text = conversion.text
        draft.readingView.currentSentenceStart = -1
        draft.readingView.currentSentenceEnd = -1
      })
      onSpeak({utterance: conversion.text, voiceName: conversion.voiceName}, {
        send({method, args}: {method: string, args?: Record<string, unknown>}) {
          if (method === "onStart") {
            stateUpdater(draft => {
              draft.readingView.sentenceStartIndicies = (args?.sentenceStartIndicies as number[]) || []
            })
          } else if (method === "onSentence") {
            stateUpdater(draft => {
              draft.readingView.currentSentenceStart = (args?.startIndex as number) ?? -1
              draft.readingView.currentSentenceEnd = (args?.endIndex as number) ?? -1
            })
          } else if (method === "onEnd") {
            stateUpdater(draft => {
              draft.readingView.currentSentenceStart = -1
              draft.readingView.currentSentenceEnd = -1
            })
          }
        }
      })
    }
  }
}



function InstallButton({voice, onInstall}: {
  voice: MyVoice
  onInstall(voice: MyVoice, onProgress: (percent: number) => void): void
}) {
  const [percent, setPercent] = React.useState<number>(0)

  React.useEffect(() => {
    if (voice.installState == "not-installed") setPercent(0)
  }, [voice.installState])

  const text = immediate(() => {
    switch (voice.installState) {
      case "not-installed": return "Install"
      case "installing": return Math.round(percent) + "%"
      case "installed": return "100%"
    }
  })

  return (
    <button type="button" className="btn btn-success btn-sm"
      disabled={voice.installState != "not-installed"}
      onClick={() => onInstall(voice, setPercent)}>
      {voice.installState == "not-installed" && "⬇️ Install"}
      {voice.installState == "installing" && `⏳ ${Math.round(percent)}%`}
      {voice.installState == "installed" && "✅ Installed"}
    </button>
  )
}
