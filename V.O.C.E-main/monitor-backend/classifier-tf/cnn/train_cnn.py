import pickle
import pandas as pd
import numpy as np
import io 
import re
import matplotlib.pyplot as plt
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelBinarizer
from sklearn.metrics import classification_report
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, Embedding, Conv1D, MaxPooling1D, GlobalMaxPooling1D, Dense, Dropout, concatenate
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.callbacks import EarlyStopping

print("Iniciando o processo de treinamento final (Modelo Híbrido CNN Aprofundado)...")

# --- 1. Carregar e Preparar Dados ---
print("[1/7] Carregando e preparando dados...")
with open('./classifier-tf/dataset.csv', 'r', encoding='utf-8') as f:
    lines = f.readlines()
cleaned_lines = [line for line in lines if not line.strip().startswith('#') and line.strip()]
csv_string = "".join(cleaned_lines)
df = pd.read_csv(io.StringIO(csv_string))
df.dropna(subset=['url', 'label'], inplace=True)
df['url_cleaned'] = df['url'].str.lower().str.replace('www.', '', regex=False)

def url_word_tokenizer(url):
    url = re.sub(r'^https?://', '', url)
    parts = url.split('.')
    if len(parts) > 1:
        tld = "tld_" + parts[-1]
        url_tokens = re.split(r'[\./-]', ".".join(parts[:-1]))
        url_tokens.append(tld)
        return ' '.join(url_tokens)
    return ' '.join(re.split(r'[\./-]', url))


df['word_tokens'] = df['url_cleaned'].apply(url_word_tokenizer)
texts_words = df['word_tokens'].tolist()
texts_chars = df['url_cleaned'].tolist()
labels = df['label'].astype(str).tolist()


# --- 2. Tokenização (Palavras e Caracteres) ---
print("[2/7] Processando texto com tokenizers de palavras e caracteres...")
MAX_WORDS = 10000
MAX_WORD_SEQUENCE_LENGTH = 20
tokenizer_word = Tokenizer(num_words=MAX_WORDS, oov_token='<UNK>')
tokenizer_word.fit_on_texts(texts_words)
X_words = pad_sequences(tokenizer_word.texts_to_sequences(texts_words), maxlen=MAX_WORD_SEQUENCE_LENGTH)

MAX_CHARS = 5000
MAX_CHAR_SEQUENCE_LENGTH = 120
tokenizer_char = Tokenizer(num_words=MAX_CHARS, char_level=True, oov_token='<UNK>')
tokenizer_char.fit_on_texts(texts_chars)
X_chars = pad_sequences(tokenizer_char.texts_to_sequences(texts_chars), maxlen=MAX_CHAR_SEQUENCE_LENGTH)

# --- 3. Carregar Vetores GloVe ---
print("[3/7] Carregando vetores de palavras GloVe...")
GLOVE_FILE = './classifier-tf/glove.6B.100d.txt'
embeddings_index = {}
try:
    with open(GLOVE_FILE, encoding='utf-8') as f:
        for line in f:
            values = line.split()
            word = values[0]
            coefs = np.asarray(values[1:], dtype='float32')
            embeddings_index[word] = coefs
except FileNotFoundError:
    print(f"ERRO: Arquivo GloVe não encontrado em '{GLOVE_FILE}'")
    print("Por favor, baixe 'glove.6B.zip' de https://nlp.stanford.edu/projects/glove/ e extraia 'glove.6B.100d.txt' para a pasta 'classifier-tf'.")
    exit()
print(f'Encontrados {len(embeddings_index)} vetores de palavras.')

# --- 4. Criar Matriz de Embedding ---
print("[4/7] Criando a matriz de embedding GloVe...")
EMBEDDING_DIM = 100
word_index = tokenizer_word.word_index
embedding_matrix = np.zeros((min(MAX_WORDS, len(word_index) + 1), EMBEDDING_DIM))
for word, i in word_index.items():
    if i >= MAX_WORDS: continue
    embedding_vector = embeddings_index.get(word)
    if embedding_vector is not None:
        embedding_matrix[i] = embedding_vector

# --- 5. Codificar Labels e Dividir Dados ---
print("[5/7] Codificando categorias e dividindo os dados...")
encoder = LabelBinarizer()
y = encoder.fit_transform(labels)
label_names = encoder.classes_
X_words_train, X_words_test, X_chars_train, X_chars_test, y_train, y_test = train_test_split(
    X_words, X_chars, y, test_size=0.2, random_state=42, stratify=y
)

# --- 6. Construir o Modelo Híbrido Aprofundado ---
print("[6/7] Construindo e treinando o modelo híbrido aprofundado...")

# Ramo de Palavras (Word Branch) com GloVe
input_words = Input(shape=(MAX_WORD_SEQUENCE_LENGTH,))
embedding_words = Embedding(
    min(MAX_WORDS, len(word_index) + 1), EMBEDDING_DIM,
    weights=[embedding_matrix], 
    trainable=True # [MUDANÇA] Permitir o ajuste fino dos pesos do GloVe
)(input_words)
conv1_words = Conv1D(128, 5, activation='relu')(embedding_words)
pool1_words = MaxPooling1D(2)(conv1_words)
conv2_words = Conv1D(128, 5, activation='relu')(pool1_words)
pool2_words = GlobalMaxPooling1D()(conv2_words)

# Ramo de Caracteres (Char Branch)
input_chars = Input(shape=(MAX_CHAR_SEQUENCE_LENGTH,))
embedding_chars = Embedding(input_dim=len(tokenizer_char.word_index) + 1, output_dim=64)(input_chars)
conv1_chars = Conv1D(128, 5, activation='relu')(embedding_chars)
pool1_chars = MaxPooling1D(5)(conv1_chars)
conv2_chars = Conv1D(128, 5, activation='relu')(pool1_chars)
pool2_chars = GlobalMaxPooling1D()(conv2_chars)

# Concatenar os dois ramos
concatenated = concatenate([pool2_words, pool2_chars])
dense1 = Dense(128, activation='relu')(concatenated)
dropout = Dropout(0.5)(dense1)
output = Dense(len(label_names), activation='softmax')(dropout)

model = Model(inputs=[input_words, input_chars], outputs=output)
model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
model.summary()

# Aumentamos a paciência
early_stopping = EarlyStopping(monitor='val_loss', patience=7, restore_best_weights=True)

history = model.fit([X_words_train, X_chars_train], y_train,
                    epochs=100,
                    batch_size=32,
                    validation_data=([X_words_test, X_chars_test], y_test),
                    verbose=1,
                    callbacks=[early_stopping])

# --- 7. Avaliar e Salvar ---
print("\n[7/7] Avaliando e salvando o modelo final...")
loss, accuracy = model.evaluate([X_words_test, X_chars_test], y_test, verbose=0)
print(f"\n📊 Acurácia final no conjunto de teste: {accuracy:.4f}\n")

y_pred_probs = model.predict([X_words_test, X_chars_test])
y_pred = np.argmax(y_pred_probs, axis=1)
y_test_indices = np.argmax(y_test, axis=1)

print("📌 Relatório de Classificação Detalhado:")
print(classification_report(y_test_indices, y_pred, target_names=label_names, zero_division=0))

model.save('./classifier-tf/model_final.keras')
with open('./classifier-tf/tokenizer_word.pkl', 'wb') as f: pickle.dump(tokenizer_word, f)
with open('./classifier-tf/tokenizer_char.pkl', 'wb') as f: pickle.dump(tokenizer_char, f)
with open('./classifier-tf/labels.pkl', 'wb') as f: pickle.dump(label_names, f)
print("Artefatos salvos com sucesso!")

# Gerar Gráficos
plt.figure(figsize=(12, 5))
plt.subplot(1, 2, 1)
plt.plot(history.history['accuracy'], label='Acurácia de Treino')
plt.plot(history.history['val_accuracy'], label='Acurácia de Validação')
plt.title('Acurácia do Modelo')
plt.xlabel('Época')
plt.ylabel('Acurácia')
plt.legend()
plt.subplot(1, 2, 2)
plt.plot(history.history['loss'], label='Perda de Treino')
plt.plot(history.history['val_loss'], label='Perda de Validação')
plt.title('Perda do Modelo')
plt.xlabel('Época')
plt.ylabel('Perda')
plt.legend()
plt.tight_layout()
plt.savefig('./classifier-tf/training_history.png')
print("Gráfico 'training_history.png' salvo com sucesso!")

