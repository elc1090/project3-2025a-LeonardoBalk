const express = require('express')
const { PrismaClient } = require('@prisma/client')
const jwt = require('jsonwebtoken')
const SECRET = 'chave'


const app = express()
const prisma = new PrismaClient()


app.use(express.json())
const cors = require('cors')
  app.use(cors())

  const port = process.env.PORT || 3001;

//  proteger rotas
function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) return res.status(401).json({ erro: 'Token não fornecido' })

  jwt.verify(token, SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ erro: 'Token inválido' })
    req.usuario = usuario
    next()
  })
}

// Rota para cadastrar usuário
app.post('/usuarios', async (req, res) => {
  const { nomeUsuario, email, senha } = req.body
  try {
    const novoUsuario = await prisma.usuario.create({
      data: { nomeUsuario, email, senha }
    })
    res.json(novoUsuario)
  } catch (error) {
    res.status(400).json({ erro: error.message })
  }
})

// Rota para login (gera token JWT)
app.post('/login', async (req, res) => {
  const { email, senha } = req.body
  console.log('Recebido no login:', { email, senha })  // log do que chegou

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } })
    console.log('Usuário encontrado:', usuario)  // log do usuário no banco

    if (!usuario || usuario.senha !== senha) {
      console.log('Credenciais inválidas')  // log se falhar
      return res.status(401).json({ erro: 'Credenciais inválidas' })
    }

    const token = jwt.sign(
      { id: usuario.id, nomeUsuario: usuario.nomeUsuario },
      SECRET,
      { expiresIn: '1h' }
    )

    console.log('Login OK - token gerado')  // log sucesso
    res.json({ token })
  } catch (error) {
    console.error('Erro no login:', error)
    res.status(500).json({ erro: error.message })
  }
})


// Criar link 
app.post('/links', autenticarToken, async (req, res) => {
  const { url, titulo, tipo, genero, publico } = req.body;

  try {
    const novoLink = await prisma.link.create({
      data: {
        usuarioId: req.usuario.id,
        url,
        titulo,
        tipo,
        genero,
        publico
      }
    });
    res.json(novoLink);
  } catch (error) {
    res.status(400).json({ erro: error.message });
  }
});

async function gerarPreview(url) {
  try {
    const resposta = await axios.get('https://api.microlink.io', {
      params: { url }
    });
    const dados = resposta.data.data; // os dados da página

    return {
      titulo: dados.title,
      imagem: dados.image.url,
    };
  } catch (error) {
    console.error('Erro ao gerar preview:', error);
    return null;
  }
}

// Listar links 
app.get('/links', async (req, res) => {
  const usuarioId = req.query.usuarioId; 

  try {
    const links = await prisma.link.findMany({
      where: { publico: true },
      include: {
        usuario: true,
        favoritos: {
          where: { usuarioId: usuarioId } // sem Number()
        }
      }
    });

    const linksComCurtido = links.map(link => {
      const { favoritos, ...resto } = link;
      return {
        ...resto,
        curtido: favoritos.length > 0
      };
    });

    res.json(linksComCurtido);
  } catch (error) {
    console.error('Erro na rota /links:', error); 
    res.status(500).json({ erro: error.message });
  }
});




app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000')
})

const handleLogout = () => {
  localStorage.removeItem('token'); // Remove o token
  navigate('/login'); // Redireciona para a tela de login
};

app.post('/favoritos', autenticarToken, async (req, res) => {
  const usuarioId = req.usuario.id;  
  const { linkId } = req.body;

  if (!usuarioId || !linkId) {
    return res.status(400).json({ mensagem: 'Dados incompletos' });
  }

  try {
    const favoritoExistente = await prisma.favorito.findFirst({
      where: { usuarioId, linkId },
    });

    if (favoritoExistente) {
      return res.status(400).json({ mensagem: 'Já curtido' });
    }

    const favorito = await prisma.favorito.create({
      data: { usuarioId, linkId },
    });

    res.json(favorito);
  } catch (error) {
    console.error('Erro ao curtir:', error);  
    res.status(500).json({ mensagem: 'Erro ao curtir' });
  }
});



app.delete('/favoritos', autenticarToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const { linkId } = req.body;

  if (!linkId) {
    return res.status(400).json({ mensagem: 'ID do link é obrigatório' });
  }

  try {
    await prisma.favorito.deleteMany({
      where: { usuarioId, linkId },
    });

    res.json({ mensagem: 'Descurtido com sucesso' });
  } catch (error) {
    console.error('Erro ao descurtir:', error);
    res.status(500).json({ mensagem: 'Erro ao descurtir' });
  }
});
