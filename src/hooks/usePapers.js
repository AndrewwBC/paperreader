import { useState, useEffect } from 'react'
import { extractPdfMeta } from '../utils/extractPdfMeta'
function sentenceCaseTitle(value) {
  const title = value?.replace(/\s+/g, " ").trim() || ""
  return title ? title[0].toUpperCase() + title.slice(1).toLowerCase() : ""
}


function paperFileName(title, originalName) {
  const source = title?.trim() || originalName?.replace(".pdf", "") || "paper"
  const words = source.split(/\s+/).filter(Boolean).slice(0, 5)
  const shortName = words.join(" ").replace(/[<>:"\\|?*]/g, "").replace(/\s+/g, " ").trim() || "paper"
  return `${shortName}.pdf`
}
const defaultMeta = () => ({
  title: '',
  authors: '',
  year: '',
  venue: '',
  task: '',
  datasets: [],
  model: '',
  metrics: [],
  tags: [],
  problem: '',
  summary: '',
  insights: '',
  notes: '',
  links: [],
  bibtex: '',
  highlights: [],
  cited: false,
  lastOpenedAt: null,
})

export function usePapers() {
  const [studies, setStudies] = useState([])
  const [papers, setPapers] = useState([])

  useEffect(() => {
    fetch('/api/studies', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setStudies(data))
      .catch(console.error)

    fetch('/api/papers', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setPapers(data))
      .catch(console.error)
  }, [])

  async function refreshStudies() {
    const data = await fetch('/api/studies', { credentials: 'include' }).then(r => r.json())
    setStudies(data)
    return data
  }

  async function createStudy(name) {
    const res = await fetch('/api/studies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error('Failed to create study')
    const study = await res.json()
    setStudies(prev => [...prev, study])
    return study
  }

  async function updateStudy(id, name) {
    const res = await fetch(`/api/studies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error('Failed to update study')
    const study = await res.json()
    setStudies(prev => prev.map(item => item.id === id ? study : item))
    return study
  }

  async function deleteStudy(id) {
    const res = await fetch(`/api/studies/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) throw new Error('Failed to delete study')
    const result = await res.json()
    setStudies(prev => prev.filter(study => study.id !== id))
    setPapers(prev => {
      prev.filter(paper => paper.studyId === id && paper.blobUrl)
        .forEach(paper => URL.revokeObjectURL(paper.blobUrl))
      return prev.filter(paper => paper.studyId !== id)
    })
    return result
  }

  async function uploadPaper(file, studyId) {
    const extracted = await extractPdfMeta(file)
    const title = sentenceCaseTitle(extracted.title)
    const meta = { ...defaultMeta(), title, year: extracted.year }

    const formData = new FormData()
    const storedName = paperFileName(title, file.name)
    const namedFile = new File([file], storedName, { type: file.type || 'application/pdf' })
    formData.append('pdf', namedFile)
    formData.append('meta', JSON.stringify(meta))
    formData.append('studyId', studyId)

    const res = await fetch('/api/papers', { method: 'POST', body: formData, credentials: 'include' })
    if (!res.ok) throw new Error('Failed to add paper')
    return res.json()
  }

  async function addPaper(file, studyId) {
    const paper = await uploadPaper(file, studyId)
    setPapers(prev => [paper, ...prev])
    await refreshStudies()
    return paper
  }

  async function addPapers(files, studyId, onProgress) {
    const added = []
    const failed = []

    for (let index = 0; index < files.length; index++) {
      const file = files[index]
      onProgress?.({
        done: index,
        total: files.length,
        fileName: file.name,
        status: 'processing',
      })

      try {
        const paper = await uploadPaper(file, studyId)
        added.push(paper)
        setPapers(prev => [paper, ...prev])
      } catch (error) {
        failed.push({ fileName: file.name, message: error.message })
      }

      onProgress?.({
        done: index + 1,
        total: files.length,
        fileName: file.name,
        status: 'complete',
      })
    }

    await refreshStudies()
    return { added, failed }
  }

  function updatePaper(id, updates) {
    setPapers(prev => prev.map(paper => paper.id === id
      ? { ...paper, ...updates, meta: updates.meta ? { ...paper.meta, ...updates.meta } : paper.meta }
      : paper
    ))
    return fetch(`/api/papers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    }).then(res => {
      if (!res.ok) throw new Error('Failed to update paper')
      return res.json()
    })
  }

  function updateMeta(id, meta) {
    return updatePaper(id, { meta }).catch(console.error)
  }

  async function deletePaper(id) {
    const res = await fetch(`/api/papers/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) throw new Error('Failed to delete paper')
    setPapers(prev => {
      const paper = prev.find(item => item.id === id)
      if (paper?.blobUrl) URL.revokeObjectURL(paper.blobUrl)
      return prev.filter(item => item.id !== id)
    })
    await refreshStudies()
  }

  // Lazily fetch and cache blob URL for viewing/downloading
  function getBlobUrl(id) {
    const paper = papers.find(p => p.id === id)
    if (!paper) return null
    if (paper.blobUrl) return paper.blobUrl

    fetch(`/api/papers/${id}/pdf`, { credentials: 'include' })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        setPapers(prev => prev.map(p => p.id === id ? { ...p, blobUrl: url } : p))
      })
      .catch(console.error)

    return null
  }

  async function migrateFromLocalStorage(onProgress) {
    const stored = localStorage.getItem('paper-vault-papers')
    if (!stored) return 0

    const oldPapers = JSON.parse(stored)
    let targetStudy = studies.find(study => study.name.toLowerCase() === 'annotation')
    if (!targetStudy) targetStudy = await createStudy('Annotation')
    let migrated = 0

    for (const paper of oldPapers) {
      try {
        const arr = paper.pdfData.split(',')
        const mime = arr[0].match(/:(.*?);/)[1]
        const bstr = atob(arr[1])
        const u8arr = new Uint8Array(bstr.length)
        for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
        const blob = new Blob([u8arr], { type: mime })
        const file = new File([blob], paper.fileName, { type: mime })

        const formData = new FormData()
        formData.append('pdf', file)
        formData.append('meta', JSON.stringify(paper.meta))
        formData.append('studyId', targetStudy.id)

        await fetch('/api/papers', { method: 'POST', body: formData, credentials: 'include' })
        migrated++
        onProgress?.(migrated, oldPapers.length)
      } catch (e) {
        console.error('Failed to migrate:', paper.fileName, e)
      }
    }

    localStorage.removeItem('paper-vault-papers')
    const fresh = await fetch('/api/papers', { credentials: 'include' }).then(r => r.json())
    setPapers(fresh)
    await refreshStudies()
    return migrated
  }

  return { studies, papers, createStudy, updateStudy, deleteStudy, addPaper, addPapers, updatePaper, updateMeta, deletePaper, getBlobUrl, migrateFromLocalStorage }
}
